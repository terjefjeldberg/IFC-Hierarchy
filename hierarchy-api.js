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

  function safeNumber(value) {
    var num = Number(value);
    return isNaN(num) ? null : num;
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

  function HierarchyApi(api) {
    this.api = api || null;
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

  HierarchyApi.prototype.fetchRoot = function () {
    var api = this.api;
    if (!api || typeof api.getProjectId !== "function") {
      return Promise.resolve({
        id: "project-unknown",
        type: "project",
        name: "Project",
        hasChildren: true,
        meta: { source: "fallback-root" },
      });
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
  };

  HierarchyApi.prototype.fetchChildren = function (node) {
    if (!node) return Promise.resolve([]);
    if (node.type === "project") return this.fetchProjectChildren(node);
    if (node.type === "site") return this.fetchSiteChildren(node);
    if (node.type === "building") return this.fetchBuildingChildren(node);
    if (node.type === "storey") return this.fetchStoreyChildren(node);
    return Promise.resolve([]);
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
      {
        id: siteNode.id + "::building::unknown",
        type: "note",
        name: "No building endpoint available in widget API",
        hasChildren: false,
        meta: { source: "site-fallback" },
      },
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
        {
          id: buildingNode.id + "::storey::missing",
          type: "note",
          name: "No storey list exposed by this project/widget API",
          hasChildren: false,
          meta: { source: "building-fallback" },
        },
      ];
    });
  };

  HierarchyApi.prototype.mapFloorRows = function (rows, buildingId, source) {
    return asArray(rows).map(function (floor) {
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
    }).filter(Boolean);
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
        {
          id: storeyNode.id + "::elements::missing",
          type: "note",
          name: "No scoped element endpoint exposed for this storey",
          hasChildren: false,
          meta: { source: "storey-fallback" },
        },
      ];
    });
  };

  HierarchyApi.prototype.mapElementRows = function (rows, storeyId, source) {
    return asArray(rows).map(function (row, index) {
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
    }).filter(Boolean);
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
