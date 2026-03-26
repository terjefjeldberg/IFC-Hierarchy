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
        if (sources[i][keys[j]] != null && String(sources[i][keys[j]]).trim()) {
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

  function decodeIfcStringToken(token) {
    var trimmed;
    if (!token || token === "$" || token === "*") return "";
    trimmed = String(token).trim();
    if (!(trimmed.charAt(0) === "'" && trimmed.charAt(trimmed.length - 1) === "'")) {
      return "";
    }
    trimmed = trimmed.slice(1, -1).replace(/''/g, "'");
    trimmed = trimmed.replace(/\\S\\(.)/g, function (_, ch) {
      return String.fromCharCode(ch.charCodeAt(0) + 128);
    });
    trimmed = trimmed.replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, function (_, hex) {
      var chars = [];
      var i;
      for (i = 0; i + 3 < hex.length; i += 4) {
        chars.push(String.fromCharCode(parseInt(hex.slice(i, i + 4), 16)));
      }
      return chars.join("");
    });
    trimmed = trimmed.replace(/\\X\\([0-9A-Fa-f]{2})/g, function (_, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    });
    return trimmed.trim();
  }

  function splitTopLevel(input) {
    var parts = [];
    var current = "";
    var depth = 0;
    var inString = false;
    var i;
    var ch;
    for (i = 0; i < input.length; i += 1) {
      ch = input.charAt(i);
      if (inString) {
        current += ch;
        if (ch === "'" && input.charAt(i + 1) === "'") {
          current += input.charAt(i + 1);
          i += 1;
        } else if (ch === "'") {
          inString = false;
        }
        continue;
      }
      if (ch === "'") {
        inString = true;
        current += ch;
        continue;
      }
      if (ch === "(") {
        depth += 1;
        current += ch;
        continue;
      }
      if (ch === ")") {
        depth -= 1;
        current += ch;
        continue;
      }
      if (ch === "," && depth === 0) {
        parts.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  function extractIfcRecords(text) {
    var clean = String(text || "").replace(/\/\*[\s\S]*?\*\//g, "");
    var dataStart = clean.indexOf("DATA;");
    var dataEnd = clean.lastIndexOf("ENDSEC;");
    var slice = dataStart >= 0 && dataEnd > dataStart ? clean.slice(dataStart + 5, dataEnd) : clean;
    var records = [];
    var i = 0;
    var hash;
    var eq;
    var depth;
    var inString;
    var end;
    var j;
    var ch;
    while (i < slice.length) {
      hash = slice.indexOf("#", i);
      if (hash < 0) break;
      eq = slice.indexOf("=", hash);
      if (eq < 0) break;
      depth = 0;
      inString = false;
      end = -1;
      for (j = eq + 1; j < slice.length; j += 1) {
        ch = slice.charAt(j);
        if (inString) {
          if (ch === "'" && slice.charAt(j + 1) === "'") {
            j += 1;
          } else if (ch === "'") {
            inString = false;
          }
          continue;
        }
        if (ch === "'") {
          inString = true;
          continue;
        }
        if (ch === "(") {
          depth += 1;
          continue;
        }
        if (ch === ")") {
          depth -= 1;
          continue;
        }
        if (ch === ";" && depth === 0) {
          end = j;
          break;
        }
      }
      if (end < 0) break;
      records.push(slice.slice(hash, end + 1).trim());
      i = end + 1;
    }
    return records;
  }

  function normalizeIfcClass(entityName) {
    var upper = String(entityName || "").toUpperCase();
    var overrides = {
      IFCPROJECT: "IfcProject",
      IFCSITE: "IfcSite",
      IFCBUILDING: "IfcBuilding",
      IFCBUILDINGSTOREY: "IfcBuildingStorey",
      IFCROAD: "IfcRoad",
      IFCROADPART: "IfcRoadPart",
      IFCGEOMODEL: "IfcGeomodel",
      IFCGEOTECHNICALSTRATUM: "IfcGeotechnicalStratum",
      IFCELEMENTASSEMBLY: "IfcElementAssembly",
      IFCPAVEMENT: "IfcPavement",
      IFCEARTHWORKSFILL: "IfcEarthworksFill",
    };
    if (overrides[upper]) return overrides[upper];
    if (upper.indexOf("IFC") !== 0) return String(entityName || "");
    return "Ifc" + upper.slice(3).toLowerCase().replace(/(^|_)([a-z])/g, function (_, prefix, ch) {
      return ch.toUpperCase();
    });
  }

  function nodeTypeForClass(ifcClass) {
    if (ifcClass === "IfcProject") return "project";
    if (ifcClass === "IfcSite") return "site";
    if (ifcClass === "IfcBuilding") return "building";
    if (ifcClass === "IfcBuildingStorey") return "storey";
    return "element";
  }

  function parseIfcRecords(records) {
    var entities = {};
    var parentByStep = {};
    var childrenByStep = {};

    asArray(records).forEach(function (record) {
      var match = String(record || "").match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\((.*)\);$/i);
      var stepId;
      var entityName;
      var args;
      var guid;
      var name;
      var ifcClass;
      var parentRef;
      var childRefs;
      if (!match) return;
      stepId = "#" + match[1];
      entityName = String(match[2]).trim();
      args = splitTopLevel(match[3]);
      guid = decodeIfcStringToken(args[0]);
      name = decodeIfcStringToken(args[2]);
      ifcClass = normalizeIfcClass(entityName);

      entities[stepId] = {
        stepId: stepId,
        entityName: entityName,
        ifcClass: ifcClass,
        guid: guid,
        name: name,
        args: args,
      };

      if (entityName === "IFCRELAGGREGATES") {
        parentRef = String(args[4] || "").trim();
        childRefs = String(args[5] || "").match(/#\d+/g) || [];
        childRefs.forEach(function (childRef) {
          parentByStep[childRef] = parentRef;
          childrenByStep[parentRef] = childrenByStep[parentRef] || [];
          childrenByStep[parentRef].push(childRef);
        });
      }

      if (entityName === "IFCRELCONTAINEDINSPATIALSTRUCTURE") {
        childRefs = String(args[4] || "").match(/#\d+/g) || [];
        parentRef = String(args[5] || "").trim();
        childRefs.forEach(function (childRef) {
          if (!parentByStep[childRef]) parentByStep[childRef] = parentRef;
          childrenByStep[parentRef] = childrenByStep[parentRef] || [];
          childrenByStep[parentRef].push(childRef);
        });
      }
    });

    return {
      entities: entities,
      parentByStep: parentByStep,
      childrenByStep: childrenByStep,
    };
  }

  function buildIfcIndex(parsed, sourceFile) {
    var entities = parsed.entities || {};
    var parentByStep = parsed.parentByStep || {};
    var childrenByStep = parsed.childrenByStep || {};
    var nodes = {};
    var guidToNodeIds = {};
    var stepToNodeId = {};
    var projectNode = null;

    Object.keys(entities).forEach(function (stepId) {
      var entity = entities[stepId];
      var nodeId;
      if (!entity.guid && !entity.ifcClass) return;
      nodeId = entity.guid || stepId;
      stepToNodeId[stepId] = nodeId;
      nodes[nodeId] = {
        id: nodeId,
        guid: entity.guid || "",
        stepId: stepId,
        type: nodeTypeForClass(entity.ifcClass),
        ifcClass: entity.ifcClass,
        name: entity.name || entity.ifcClass || stepId,
        parentId: null,
        childrenIds: [],
        sourceFile: sourceFile,
      };
      if (entity.guid) {
        guidToNodeIds[entity.guid] = guidToNodeIds[entity.guid] || [];
        guidToNodeIds[entity.guid].push(nodeId);
      }
    });

    Object.keys(nodes).forEach(function (nodeId) {
      var node = nodes[nodeId];
      var parentStep = parentByStep[node.stepId];
      var childSteps = childrenByStep[node.stepId] || [];
      if (parentStep && stepToNodeId[parentStep]) {
        node.parentId = stepToNodeId[parentStep];
      }
      node.childrenIds = childSteps
        .map(function (childStep) {
          return stepToNodeId[childStep];
        })
        .filter(Boolean);
    });

    Object.keys(nodes).some(function (nodeId) {
      if (nodes[nodeId].ifcClass === "IfcProject" && !nodes[nodeId].parentId) {
        projectNode = nodes[nodeId];
        return true;
      }
      return false;
    });

    if (!projectNode) {
      Object.keys(nodes).some(function (nodeId) {
        if (nodes[nodeId].ifcClass === "IfcProject") {
          projectNode = nodes[nodeId];
          return true;
        }
        return false;
      });
    }

    if (!projectNode) {
      Object.keys(nodes).some(function (nodeId) {
        if (!nodes[nodeId].parentId) {
          projectNode = nodes[nodeId];
          return true;
        }
        return false;
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      sourceFile: sourceFile,
      rootId: projectNode ? projectNode.id : "",
      nodes: nodes,
      guidToNodeIds: guidToNodeIds,
    };
  }

  function buildIfcIndexFromText(text, sourceFile) {
    return buildIfcIndex(parseIfcRecords(extractIfcRecords(text)), sourceFile);
  }

  function mergeIfcIndexes(indexes) {
    var active = asArray(indexes).filter(function (index) {
      return index && index.nodes && index.rootId;
    });
    var combined = {
      generatedAt: new Date().toISOString(),
      rootId: "workspace::root",
      sourceFiles: [],
      sourceCount: active.length,
      nodes: {
        "workspace::root": {
          id: "workspace::root",
          type: "workspace",
          name: "Models",
          parentId: null,
          childrenIds: [],
          sourceFile: "",
        },
      },
      guidToNodeIds: {},
    };

    active.forEach(function (sourceIndex, sourcePosition) {
      var sourceName = firstString(sourceIndex.sourceFile, "IFC Model " + (sourcePosition + 1));
      var modelId = "model::" + sourcePosition + "::" + sourceName;
      var remap = {};
      combined.sourceFiles.push(sourceName);
      combined.nodes[combined.rootId].childrenIds.push(modelId);
      combined.nodes[modelId] = {
        id: modelId,
        type: "model",
        name: sourceName.replace(/\.ifc$/i, ""),
        parentId: combined.rootId,
        childrenIds: [],
        sourceFile: sourceName,
      };

      Object.keys(sourceIndex.nodes || {}).forEach(function (originalId) {
        remap[originalId] = "ifc::" + sourcePosition + "::" + originalId;
      });

      Object.keys(sourceIndex.nodes || {}).forEach(function (originalId) {
        var sourceNode = sourceIndex.nodes[originalId];
        var mappedId = remap[originalId];
        combined.nodes[mappedId] = {
          id: mappedId,
          guid: sourceNode.guid || "",
          stepId: sourceNode.stepId || "",
          type: sourceNode.type || "element",
          ifcClass: sourceNode.ifcClass || "",
          name: sourceNode.name || sourceNode.ifcClass || originalId,
          parentId: null,
          childrenIds: asArray(sourceNode.childrenIds)
            .map(function (childId) {
              return remap[childId];
            })
            .filter(Boolean),
          sourceFile: sourceName,
        };
      });

      Object.keys(sourceIndex.nodes || {}).forEach(function (originalId) {
        var sourceNode = sourceIndex.nodes[originalId];
        var mappedId = remap[originalId];
        combined.nodes[mappedId].parentId = sourceNode.parentId
          ? remap[sourceNode.parentId]
          : originalId === sourceIndex.rootId
          ? modelId
          : null;
      });

      if (sourceIndex.rootId && remap[sourceIndex.rootId]) {
        combined.nodes[modelId].childrenIds.push(remap[sourceIndex.rootId]);
      }

      Object.keys(sourceIndex.guidToNodeIds || {}).forEach(function (guid) {
        combined.guidToNodeIds[guid] = combined.guidToNodeIds[guid] || [];
        asArray(sourceIndex.guidToNodeIds[guid]).forEach(function (originalId) {
          if (remap[originalId]) combined.guidToNodeIds[guid].push(remap[originalId]);
        });
      });
    });

    return active.length ? combined : null;
  }

  function readFileText(file) {
    if (file && typeof file.text === "function") return file.text();
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result || "");
      };
      reader.onerror = function () {
        reject(reader.error || new Error("Failed to read file"));
      };
      reader.readAsText(file);
    });
  }

  function HierarchyApi(api) {
    this.api = api || null;
    this.uploadedIfcIndexes = [];
    this.mergedIfcIndex = null;
    this.mergedIfcIndexPromise = null;
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
      localIfcUpload: true,
    };
  };

  HierarchyApi.prototype.getIfcIndexSummary = function () {
    var names = [];
    this.uploadedIfcIndexes.forEach(function (index) {
      if (index && index.sourceFile) {
        names.push(index.sourceFile);
      }
    });
    return {
      sourceCount: names.length,
      sourceFiles: names,
      uploadedCount: names.length,
    };
  };

  HierarchyApi.prototype.invalidateIfcIndex = function () {
    this.mergedIfcIndex = null;
    this.mergedIfcIndexPromise = null;
  };

  HierarchyApi.prototype.loadIfcFiles = function (files) {
    var self = this;
    var list = asArray(files);
    if (!list.length) return Promise.resolve(this.getIfcIndexSummary());
    return Promise.all(
      list.map(function (file) {
        return readFileText(file).then(function (text) {
          return buildIfcIndexFromText(text, firstString(file && file.name, "uploaded.ifc"));
        });
      })
    ).then(function (indexes) {
      var byName = {};
      self.uploadedIfcIndexes.forEach(function (index) {
        if (index && index.sourceFile) byName[index.sourceFile] = index;
      });
      indexes.forEach(function (index) {
        if (index && index.sourceFile) byName[index.sourceFile] = index;
      });
      self.uploadedIfcIndexes = Object.keys(byName)
        .sort()
        .map(function (name) {
          return byName[name];
        });
      self.invalidateIfcIndex();
      return self.loadIfcIndex().then(function () {
        return self.getIfcIndexSummary();
      });
    });
  };

  HierarchyApi.prototype.clearUploadedIfcFiles = function () {
    var self = this;
    this.uploadedIfcIndexes = [];
    this.invalidateIfcIndex();
    return this.loadIfcIndex().then(function () {
      return self.getIfcIndexSummary();
    });
  };

  HierarchyApi.prototype.loadIfcIndex = function () {
    var self = this;
    if (this.mergedIfcIndex) return Promise.resolve(this.mergedIfcIndex);
    if (this.mergedIfcIndexPromise) return this.mergedIfcIndexPromise;

    this.mergedIfcIndexPromise = Promise.resolve().then(function () {
      self.mergedIfcIndex = mergeIfcIndexes(self.uploadedIfcIndexes);
      return self.mergedIfcIndex;
    });

    return this.mergedIfcIndexPromise;
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
        sourceFile: indexedNode.sourceFile,
        raw: indexedNode,
      },
    };
  };

  HierarchyApi.prototype.fetchChildrenFromIfcIndex = function (node) {
    var self = this;
    return this.loadIfcIndex().then(function (index) {
      var indexedNode;
      if (!index || !index.nodes) return null;
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
    if (index.rootId && path.length && String(path[0].id) === String(index.rootId)) {
      path.shift();
    }
    return path;
  };

  HierarchyApi.prototype.resolvePathFromIfcIndex = function (identifiers) {
    var self = this;
    return this.loadIfcIndex().then(function (index) {
      var nodeIds = [];
      var nodeId = "";
      if (!index || !index.nodes) return null;
      uniqueStrings(identifiers).some(function (identifier) {
        var value = String(identifier || "");
        if (!value) return false;
        nodeIds = asArray(index.guidToNodeIds && index.guidToNodeIds[value]);
        if (!nodeIds.length && index.nodes[value]) nodeIds = [value];
        nodeId = nodeIds.length ? String(nodeIds[0]) : "";
        return !!nodeId;
      });
      if (!nodeId) return null;
      return {
        selectedId: nodeId,
        path: self.buildPathFromIndexedNode(index, nodeId),
      };
    });
  };

  HierarchyApi.prototype.fetchRoot = function () {
    var self = this;
    return this.loadIfcIndex().then(function (index) {
      if (index && index.rootId && index.nodes && index.nodes[index.rootId]) {
        return self.mapIndexedNode(index.nodes[index.rootId]);
      }
      return {
        id: "note::upload-required",
        type: "note",
        name: "Load one or more IFC files to build the hierarchy",
        hasChildren: false,
        meta: { source: "upload-required" },
      };
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
    return this.tryCollections(["/api/v1/buildings", "/api/v1/v2/buildings"]).then(function (rows) {
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
    });
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
        var floorName = firstString(floor && floor.name, floor && floor.title, floorId, "Storey");
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
    var index = 0;
    if (typeof api.getObjectInfo !== "function") {
      return Promise.resolve({ detail: null, identifiers: identifiers });
    }

    function next() {
      var identifier;
      if (index >= identifiers.length) {
        return Promise.resolve({ detail: null, identifiers: identifiers });
      }
      identifier = identifiers[index++];
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
      return node && (node.type === "site" || node.type === "building" || node.type === "storey");
    });
  };

  HierarchyApi.prototype.resolvePickedObjectPath = function (picked) {
    var self = this;
    var pickedIdentifiers = this.extractPickedObjectCandidates(picked);
    var ifcSummary = this.getIfcIndexSummary();
    return this.resolvePathFromIfcIndex(pickedIdentifiers).then(function (indexedResult) {
      if (indexedResult && indexedResult.path && indexedResult.path.length) {
        indexedResult.pathSource = "ifc-index";
        return indexedResult;
      }

      return self.bestEffortGetObjectInfo(picked).then(function (result) {
        var detailSources = [
          result && result.detail,
          result && result.detail && result.detail.raw,
          result && result.detail && result.detail.attributes,
        ];
        var detailIdentifiers = uniqueStrings(
          pickedIdentifiers.concat([
            pickFromSources(detailSources, ["guid", "globalId", "ifcGuid", "GlobalId"]),
            pickFromSources(detailSources, ["id", "objectId", "dbId", "expressId"]),
            pickFromSources(detailSources, ["objectGuid", "object-guid", "ifcObjectGuid"]),
          ])
        );

        return self.resolvePathFromIfcIndex(detailIdentifiers).then(function (detailIndexedResult) {
          if (detailIndexedResult && detailIndexedResult.path && detailIndexedResult.path.length) {
            detailIndexedResult.pathSource = "ifc-index";
            return detailIndexedResult;
          }
          return {
            selectedId: firstString(result && result.selectedId, detailIdentifiers[0]),
            path: [],
            pathSource: "missing-from-ifc",
            message: ifcSummary && ifcSummary.sourceCount
              ? "Selected object is not present in the loaded IFC files"
              : "Load one or more IFC files before selecting objects",
          };
        });
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
      var path;
      if (index >= paths.length) return Promise.resolve([]);
      path = paths[index++];
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


