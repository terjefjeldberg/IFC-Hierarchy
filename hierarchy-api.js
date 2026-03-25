(function (global) {
  "use strict";

  function asArray(value) {
    return Array.isArray(value) ? value : value ? [value] : [];
  }

  function firstString() {
    var i;
    for (i = 0; i < arguments.length; i++) {
      if (arguments[i] != null && String(arguments[i]).trim()) {
        return String(arguments[i]).trim();
      }
    }
    return "";
  }

  function uniqueStrings(values) {
    var seen = {};
    return asArray(values)
      .map(function (value) {
        return value == null ? "" : String(value).trim();
      })
      .filter(function (value) {
        if (!value || seen[value]) return false;
        seen[value] = true;
        return true;
      });
  }

  function relationId(row, relationName) {
    var rel = row && row.raw && row.raw.relationships;
    var data = rel && rel[relationName] && rel[relationName].data;
    return data && data.id != null ? String(data.id) : "";
  }

  function attributeValue(row, keys) {
    var attrs = row && row.raw && row.raw.attributes;
    var i;
    if (!attrs) return "";
    for (i = 0; i < keys.length; i++) {
      if (attrs[keys[i]] != null && String(attrs[keys[i]]).trim()) {
        return String(attrs[keys[i]]).trim();
      }
    }
    return "";
  }

  function nestedValue(source, path) {
    var value = source;
    var i;
    for (i = 0; i < path.length; i++) {
      if (!value || typeof value !== "object") return null;
      value = value[path[i]];
    }
    return value == null ? null : value;
  }

  function pickFromSources(sources, keys) {
    var i;
    var j;
    for (i = 0; i < sources.length; i++) {
      if (!sources[i] || typeof sources[i] !== "object") continue;
      for (j = 0; j < keys.length; j++) {
        if (
          sources[i][keys[j]] != null &&
          String(sources[i][keys[j]]).trim()
        ) {
          return String(sources[i][keys[j]]).trim();
        }
      }
    }
    return "";
  }

  function mapJsonApiRow(row) {
    return {
      id: row && row.id != null ? String(row.id) : "",
      type: row && row.type ? String(row.type) : "",
      name: firstString(
        attributeValue({ raw: row }, ["name", "title", "label", "long-name"]),
        row && row.id != null ? row.id : ""
      ),
      raw: row || {},
    };
  }

  function buildNote(id, name, source) {
    return {
      id: id,
      type: "note",
      name: name,
      hasChildren: false,
      meta: { source: source || "note" },
    };
  }

  function HierarchyApi(api) {
    this.api = api || null;
    this.ifcIndex = null;
    this.ifcIndexPromise = null;
  }

  HierarchyApi.prototype.probeCapabilities = function () {
    var a = this.api || {};
    return {
      getProjectId: typeof a.getProjectId === "function",
      getBuildingId: typeof a.getBuildingId === "function",
      getFloors: typeof a.getFloors === "function",
      findObjects: typeof a.findObjects === "function",
      getObjectInfo: typeof a.getObjectInfo === "function",
      gotoObject: typeof a.gotoObject === "function",
      highlightObject: typeof a.highlightObject === "function",
      makeApiRequest: typeof a.makeApiRequest === "function",
    };
  };

  HierarchyApi.prototype.loadIfcIndex = function () {
    var self = this;
    if (this.ifcIndex) return Promise.resolve(this.ifcIndex);
    if (this.ifcIndexPromise) return this.ifcIndexPromise;
    if (typeof global.fetch !== "function") return Promise.resolve(null);

    this.ifcIndexPromise = global
      .fetch("./hierarchy-index.json", { cache: "no-store" })
      .then(function (response) {
        if (!response || !response.ok) return null;
        return response.json();
      })
      .then(function (index) {
        self.ifcIndex = index && index.nodes ? index : null;
        return self.ifcIndex;
      })
      .catch(function () {
        self.ifcIndex = null;
        return null;
      });

    return this.ifcIndexPromise;
  };

  HierarchyApi.prototype.getIfcModelRoot = function (index) {
    var sourceFile = firstString(index && index.sourceFile, "IFC Model");
    return {
      id: "model::" + sourceFile,
      type: "model",
      name: sourceFile.replace(/.ifc$/i, ""),
      hasChildren: true,
      meta: {
        source: "ifc-index",
        sourceFile: sourceFile,
      },
    };
  };

  HierarchyApi.prototype.mapIndexedNode = function (indexedNode) {
    if (!indexedNode) return null;
    return {
      id: String(indexedNode.id),
      type: indexedNode.type || "element",
      name: firstString(indexedNode.name, indexedNode.ifcClass, indexedNode.id),
      hasChildren: asArray(indexedNode.childrenIds).length > 0,
      meta: {
        source: "ifc-index",
        objectId: firstString(indexedNode.guid, indexedNode.id),
        ifcClass: indexedNode.ifcClass,
        stepId: indexedNode.stepId,
        raw: indexedNode,
      },
    };
  };

  HierarchyApi.prototype.fetchChildrenFromIfcIndex = function (node) {
    var self = this;
    return this.loadIfcIndex().then(function (index) {
      var indexedNode;
      if (!index || !index.nodes) return null;
      if (node && node.type === "model") {
        if (index.rootId && index.nodes[index.rootId]) {
          return [self.mapIndexedNode(index.nodes[index.rootId])].filter(Boolean);
        }
        return [];
      }
      indexedNode = index.nodes[String(node && node.id)];
      if (!indexedNode) return null;
      return asArray(indexedNode.childrenIds)
        .map(function (childId) {
          return self.mapIndexedNode(index.nodes[String(childId)]);
        })
        .filter(Boolean);
    });
  };

  HierarchyApi.prototype.buildPathFromIndexedNode = function (index, nodeId) {
    var path = [];
    var seen = {};
    var currentId = String(nodeId || "");
    while (currentId && index.nodes[currentId] && !seen[currentId]) {
      seen[currentId] = true;
      path.push(this.mapIndexedNode(index.nodes[currentId]));
      currentId = index.nodes[currentId].parentId ? String(index.nodes[currentId].parentId) : "";
    }
    path.reverse();
    return path;
  };

  HierarchyApi.prototype.resolvePathFromIfcIndex = function (identifiers) {
    var self = this;
    return this.loadIfcIndex().then(function (index) {
      var nodeId = "";
      if (!index || !index.nodes) return null;
      uniqueStrings(identifiers).some(function (identifier) {
        var value = String(identifier || "");
        if (!value) return false;
        nodeId =
          (index.guidToNodeId && index.guidToNodeId[value]) ||
          (index.nodes[value] ? value : "");
        return !!nodeId;
      });
      if (!nodeId) return null;
      return {
        selectedId: String(nodeId),
        path: self.buildPathFromIndexedNode(index, nodeId),
      };
    });
  };

  HierarchyApi.prototype.fetchRoot = function () {
    var api = this.api;
    var self = this;
    return this.loadIfcIndex().then(function (index) {
      if (index && index.rootId && index.nodes && index.nodes[index.rootId]) {
        return self.getIfcModelRoot(index);
      }
      if (!api || typeof api.getProjectId !== "function") {
        return {
          id: "project-unknown",
          type: "project",
          name: "Project",
          hasChildren: true,
          meta: { source: "fallback-root" },
        };
      }
      return api.getProjectId().then(function (projectId) {
        return {
          id: String(projectId || "project-unknown"),
          type: "project",
          name: "Project " + String(projectId || "unknown"),
          hasChildren: true,
          meta: { source: "getProjectId" },
        };
      });
    });
  };

  HierarchyApi.prototype.fetchChildren = function (node) {
    var self = this;
    if (!node) return Promise.resolve([]);
    return this.fetchChildrenFromIfcIndex(node).then(function (indexedChildren) {
      if (indexedChildren) return indexedChildren;
      if (node.type === "project") return self.fetchProjectChildren(node);
      if (node.type === "site") return self.fetchSiteChildren(node);
      if (node.type === "building") return self.fetchBuildingChildren(node);
      if (node.type === "storey") return self.fetchStoreyChildren(node);
      return [];
    });
  };

  HierarchyApi.prototype.fetchProjectChildren = function (projectNode) {
    var self = this;
    return this.tryCollections(["/api/v1/buildings", "/api/v1/v2/buildings"]).then(
      function (rows) {
        if (rows.length) {
          return [
            {
              id: projectNode.id + "::site::default",
              type: "site",
              name: "Site",
              hasChildren: true,
              meta: {
                source: "buildings-endpoint",
                buildings: rows,
              },
            },
          ];
        }
        return self.fallbackSiteNode(projectNode);
      }
    );
  };

  HierarchyApi.prototype.fallbackSiteNode = function (projectNode) {
    return Promise.resolve([
      {
        id: projectNode.id + "::site::default",
        type: "site",
        name: "Site",
        hasChildren: true,
        meta: { source: "fallback-site" },
      },
    ]);
  };

  HierarchyApi.prototype.fetchSiteChildren = function (siteNode) {
    var api = this.api || {};
    var buildings = asArray(siteNode.meta && siteNode.meta.buildings);
    if (buildings.length) {
      return Promise.resolve(this.mapBuildingRows(buildings));
    }
    if (typeof api.getBuildingId === "function") {
      return api.getBuildingId().then(function (id) {
        return [
          {
            id: String(id || "building-unknown"),
            type: "building",
            name: "Building " + String(id || "unknown"),
            hasChildren: true,
            meta: { source: "getBuildingId" },
          },
        ];
      });
    }
    return Promise.resolve([
      buildNote(
        siteNode.id + "::building::unknown",
        "No building endpoint available in widget API",
        "site-fallback"
      ),
    ]);
  };

  HierarchyApi.prototype.mapBuildingRows = function (rows) {
    return asArray(rows).map(function (row) {
      return {
        id: String(row.id),
        type: "building",
        name: firstString(row.name, "Building " + row.id),
        hasChildren: true,
        meta: { source: "building-row", raw: row.raw || row },
      };
    });
  };

  HierarchyApi.prototype.fetchBuildingChildren = function (buildingNode) {
    var api = this.api || {};
    var self = this;

    if (typeof api.getFloors === "function") {
      return api.getFloors().then(function (floors) {
        var mapped = self.mapFloorRows(asArray(floors), buildingNode.id, "getFloors");
        if (mapped.length) return mapped;
        return self.fetchBuildingChildrenFromApi(buildingNode);
      });
    }

    return this.fetchBuildingChildrenFromApi(buildingNode);
  };

  HierarchyApi.prototype.fetchBuildingChildrenFromApi = function (buildingNode) {
    var self = this;
    return this.tryCollections([
      "/api/v1/buildings/" + encodeURIComponent(buildingNode.id) + "/floors",
      "/api/v1/floors",
      "/api/v1/v2/floors",
    ]).then(function (rows) {
      var filtered = rows.filter(function (row) {
        var buildingRel = relationId(row, "building");
        var buildingAttr = attributeValue(row, ["building-id", "buildingId"]);
        return !buildingRel && !buildingAttr
          ? true
          : String(buildingRel || buildingAttr) === String(buildingNode.id);
      });
      var mapped = self.mapFloorRows(filtered, buildingNode.id, "floors-endpoint");
      if (mapped.length) return mapped;
      return [
        buildNote(
          buildingNode.id + "::storey::missing",
          "No storey list exposed by this project/widget API",
          "building-fallback"
        ),
      ];
    });
  };

  HierarchyApi.prototype.mapFloorRows = function (rows, buildingId, source) {
    return asArray(rows)
      .map(function (floor) {
        var floorId = firstString(
          floor && floor.id,
          floor && floor.floorId,
          floor && floor.name,
          floor && floor.title
        );
        var floorName = firstString(
          floor && floor.name,
          floor && floor.title,
          floorId,
          "Storey"
        );
        if (!floorId) return null;
        return {
          id: String(floorId),
          type: "storey",
          name: String(floorName),
          hasChildren: true,
          meta: {
            source: source,
            buildingId: String(buildingId || ""),
            raw: floor.raw || floor,
          },
        };
      })
      .filter(Boolean);
  };

  HierarchyApi.prototype.fetchStoreyChildren = function (storeyNode) {
    var self = this;
    return this.tryCollections([
      "/api/v1/floors/" + encodeURIComponent(storeyNode.id) + "/objects",
      "/api/v1/building-storeys/" + encodeURIComponent(storeyNode.id) + "/objects",
      "/api/v1/storeys/" + encodeURIComponent(storeyNode.id) + "/objects",
      "/api/v1/v2/floors/" + encodeURIComponent(storeyNode.id) + "/objects",
    ]).then(function (rows) {
      var mapped = self.mapElementRows(rows, storeyNode.id, "storey-objects-endpoint");
      if (mapped.length) return mapped;
      return [
        buildNote(
          storeyNode.id + "::elements::missing",
          "No scoped element endpoint exposed for this storey",
          "storey-fallback"
        ),
      ];
    });
  };

  HierarchyApi.prototype.mapElementRows = function (rows, storeyId, source) {
    return asArray(rows)
      .map(function (row, index) {
        var id = firstString(
          row && row.id,
          attributeValue(row, ["guid", "global-id", "globalId", "object-id"]),
          index
        );
        if (!String(id).trim()) return null;
        return {
          id: String(id),
          type: "element",
          name: firstString(
            row && row.name,
            attributeValue(row, ["name", "type", "object-type", "ifc-class"]),
            "Element " + id
          ),
          hasChildren: false,
          meta: {
            source: source,
            storeyId: String(storeyId || ""),
            raw: row.raw || row,
            objectId: firstString(
              row && row.id,
              attributeValue(row, ["object-id", "guid", "global-id", "globalId"]),
              id
            ),
          },
        };
      })
      .filter(Boolean);
  };

  HierarchyApi.prototype.extractPickedObjectCandidates = function (picked) {
    var sources = [
      picked,
      nestedValue(picked, ["object"]),
      nestedValue(picked, ["item"]),
      nestedValue(picked, ["data"]),
      nestedValue(picked, ["result"]),
      nestedValue(picked, ["selection"]),
    ];

    return uniqueStrings([
      pickFromSources(sources, ["guid", "globalId", "ifcGuid", "GlobalId"]),
      pickFromSources(sources, ["id", "objectId", "dbId", "expressId"]),
      pickFromSources(sources, ["objectGuid", "object-guid", "ifcObjectGuid"]),
    ]);
  };

  HierarchyApi.prototype.bestEffortGetObjectInfo = function (picked) {
    var api = this.api || {};
    var identifiers = this.extractPickedObjectCandidates(picked);
    var self = this;
    var index = 0;

    if (typeof api.getObjectInfo !== "function") {
      return Promise.resolve({ detail: null, identifiers: identifiers });
    }

    function next() {
      if (index >= identifiers.length) {
        return Promise.resolve({ detail: null, identifiers: identifiers });
      }
      var identifier = identifiers[index++];
      return api.getObjectInfo(identifier).then(
        function (detail) {
          return {
            detail: detail || null,
            identifiers: identifiers,
            selectedId: identifier,
          };
        },
        function () {
          return next();
        }
      );
    }

    return next().then(function (result) {
      if (result.detail) return result;
      return {
        detail: null,
        identifiers: identifiers,
        selectedId: firstString(identifiers[0]),
      };
    });
  };

  HierarchyApi.prototype.pathHasHierarchyContext = function (path) {
    return asArray(path).some(function (node) {
      return (
        node &&
        (node.type === "site" ||
          node.type === "building" ||
          node.type === "storey")
      );
    });
  };

  HierarchyApi.prototype.resolvePickedObjectPath = function (picked) {
    var self = this;
    var pickedIdentifiers = this.extractPickedObjectCandidates(picked);
    return this.resolvePathFromIfcIndex(pickedIdentifiers).then(function (indexedResult) {
      var directPath;
      if (indexedResult && indexedResult.path && indexedResult.path.length) {
        return indexedResult;
      }

      directPath = self.derivePathFromObject({}, pickedIdentifiers, picked);
      if (self.pathHasHierarchyContext(directPath)) {
        return {
          selectedId: directPath[directPath.length - 1].id,
          path: directPath,
        };
      }

      return self.bestEffortGetObjectInfo(picked).then(function (result) {
        var detail = result.detail || {};
        var identifiers = result.identifiers || [];
        var path = self.derivePathFromObject(detail, identifiers, picked);
        if (!path.length) {
          return {
            selectedId: firstString(result.selectedId, identifiers[0]),
            path: [
              {
                id: "selection::missing",
                type: "note",
                name: "Clicked object could not be resolved to hierarchy",
                hasChildren: false,
                meta: { source: "selection-fallback" },
              },
            ],
          };
        }
        return {
          selectedId: path[path.length - 1].id,
          path: path,
        };
      });
    });
  };

  HierarchyApi.prototype.deriveIfcClassLineage = function (ifcClass) {
    var name = firstString(ifcClass);
    if (!name || name === "IfcElement") return name ? [name] : [];
    if (
      name === "IfcProject" ||
      name === "IfcSite" ||
      name === "IfcBuilding" ||
      name === "IfcBuildingStorey"
    ) {
      return [name];
    }
    if (/^Ifc/i.test(name)) {
      return ["IfcElement", name];
    }
    return [name];
  };

  HierarchyApi.prototype.derivePathFromObject = function (detail, identifiers, picked) {
    var elementSources = [
      detail,
      detail && detail.raw,
      detail && detail.attributes,
      nestedValue(picked, ["object"]),
      nestedValue(picked, ["item"]),
      nestedValue(picked, ["data"]),
      picked,
    ];
    var siteId = firstString(
      relationId(detail, "site"),
      pickFromSources(elementSources, ["siteId", "site-id", "siteGuid", "site"])
    );
    var siteName = firstString(
      pickFromSources(elementSources, ["siteName", "site-name", "spatialContainerName"]),
      siteId ? "Site " + siteId : "Site"
    );
    var buildingId = firstString(
      relationId(detail, "building"),
      pickFromSources(elementSources, ["buildingId", "building-id", "buildingGuid", "building"])
    );
    var buildingName = firstString(
      pickFromSources(elementSources, ["buildingName", "building-name"]),
      buildingId ? "Building " + buildingId : "Building"
    );
    var storeyId = firstString(
      relationId(detail, "floor"),
      relationId(detail, "storey"),
      relationId(detail, "building-storey"),
      pickFromSources(elementSources, [
        "floorId",
        "floor-id",
        "storeyId",
        "storey-id",
        "buildingStoreyId",
        "building-storey-id",
        "levelId",
      ])
    );
    var storeyName = firstString(
      pickFromSources(elementSources, ["floorName", "storeyName", "levelName"]),
      storeyId ? "Storey " + storeyId : "Storey"
    );
    var elementId = firstString(
      pickFromSources(elementSources, ["guid", "globalId", "ifcGuid", "GlobalId"]),
      pickFromSources(elementSources, ["id", "objectId", "dbId", "expressId"]),
      identifiers[0]
    );
    var ifcClass = firstString(
      pickFromSources(elementSources, ["ifcClass", "ifcType", "object-type", "type"])
    );
    var elementName = firstString(
      pickFromSources(elementSources, ["name", "Name", "title"]),
      ifcClass,
      elementId ? "Element " + elementId : "Selected element"
    );

    var path = [];
    if (siteId || buildingId || storeyId) {
      path.push({
        id: siteId || "site::selected",
        type: "site",
        name: siteName,
        hasChildren: true,
        meta: { source: siteId ? "selected-object" : "synthetic-site" },
      });
    }
    if (buildingId) {
      path.push({
        id: buildingId,
        type: "building",
        name: buildingName,
        hasChildren: true,
        meta: { source: "selected-object" },
      });
    }
    if (storeyId) {
      path.push({
        id: storeyId,
        type: "storey",
        name: storeyName,
        hasChildren: true,
        meta: { source: "selected-object", buildingId: buildingId },
      });
    }

    this.deriveIfcClassLineage(ifcClass).forEach(function (typeName, index, all) {
      if (!typeName || (index === all.length - 1 && !elementId)) return;
      if (index === all.length - 1) return;
      path.push({
        id: "ifc-class::" + typeName,
        type: "ifc-class",
        name: typeName,
        hasChildren: true,
        meta: { source: "ifc-class-lineage" },
      });
    });

    if (elementId) {
      path.push({
        id: elementId,
        type: "element",
        name: elementName,
        hasChildren: false,
        meta: {
          source: "selected-object",
          objectId: elementId,
          raw: detail || picked || {},
          storeyId: storeyId,
          buildingId: buildingId,
          ifcClass: ifcClass,
        },
      });
    }

    return path;
  };

  HierarchyApi.prototype.tryCollections = function (paths) {
    var self = this;
    var index = 0;

    function next() {
      if (index >= paths.length) return Promise.resolve([]);
      var path = paths[index++];
      return self.tryJsonApiCollection(path).then(function (rows) {
        if (rows.length) return rows;
        return next();
      });
    }

    return next();
  };

  HierarchyApi.prototype.tryJsonApiCollection = function (path) {
    var api = this.api;
    if (!api || typeof api.makeApiRequest !== "function") {
      return Promise.resolve([]);
    }
    return api
      .makeApiRequest({
        method: "GET",
        path: path,
        headers: { Accept: "application/vnd.api+json" },
      })
      .then(function (res) {
        return asArray(res && res.data).map(mapJsonApiRow);
      })
      .catch(function () {
        return [];
      });
  };

  global.HierarchyApi = HierarchyApi;
})(window);


