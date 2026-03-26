(function (global) {
  "use strict";

  function formatIfcSummary(summary) {
    var count = summary && summary.sourceCount ? summary.sourceCount : 0;
    return count === 1 ? "1 IFC source" : String(count) + " IFC sources";
  }

  function HierarchyStore(apiAdapter) {
    this.apiAdapter = apiAdapter;
    this.nodesById = {};
    this.rootId = null;
    this.expanded = {};
    this.loading = {};
    this.error = "";
    this.statusMessage = "Initializing...";
    this.selectedId = "";
    this.selectedPath = [];
    this.focusedPathIds = [];
    this.capabilities = apiAdapter.probeCapabilities();
    this.propertyGroups = [];
    this.propertiesLoading = false;
    this.propertiesError = "";
    this.propertiesMessage = "Select an IFC object to view properties";
    this.propertiesTitle = "";
    this.propertiesTargetId = "";
    this.propertiesRequestId = 0;
    this.onChange = function () {};
  }

  HierarchyStore.prototype.emit = function () {
    this.onChange(this.getState());
  };

  HierarchyStore.prototype.getState = function () {
    return {
      rootId: this.rootId,
      nodesById: this.nodesById,
      expanded: this.expanded,
      loading: this.loading,
      error: this.error,
      statusMessage: this.error || this.statusMessage,
      selectedId: this.selectedId,
      selectedPath: this.selectedPath,
      capabilities: this.capabilities,
      ifcSummary: this.apiAdapter.getIfcIndexSummary(),
      propertyGroups: this.propertyGroups,
      propertiesLoading: this.propertiesLoading,
      propertiesError: this.propertiesError,
      propertiesMessage: this.propertiesError || this.propertiesMessage,
      propertiesTitle: this.propertiesTitle,
      propertiesTargetId: this.propertiesTargetId,
    };
  };

  HierarchyStore.prototype.clearProperties = function (message) {
    this.propertyGroups = [];
    this.propertiesLoading = false;
    this.propertiesError = "";
    this.propertiesTitle = "";
    this.propertiesTargetId = "";
    this.propertiesMessage = message || "Select an IFC object to view properties";
  };

  HierarchyStore.prototype.setStatusMessage = function (message, isError) {
    this.error = isError ? String(message || "") : "";
    this.statusMessage = String(message || "Ready");
    this.emit();
  };

  HierarchyStore.prototype.resetTreeState = function () {
    this.nodesById = {};
    this.rootId = null;
    this.expanded = {};
    this.loading = {};
    this.error = "";
    this.selectedId = "";
    this.selectedPath = [];
    this.focusedPathIds = [];
    this.clearProperties();
  };

  HierarchyStore.prototype.upsertNode = function (node, parentId) {
    var id = String(node.id);
    var existing = this.nodesById[id] || {};
    this.nodesById[id] = {
      id: id,
      type: node.type,
      name: node.name,
      hasChildren: !!node.hasChildren,
      parentId: parentId || existing.parentId || null,
      childrenIds: existing.childrenIds || [],
      childrenLoaded: !!existing.childrenLoaded,
      meta: node.meta || existing.meta || {},
    };
    return this.nodesById[id];
  };

  HierarchyStore.prototype.ensureChildLink = function (parentId, childId) {
    var parent = this.nodesById[parentId];
    if (!parent) return;
    if (parent.childrenIds.indexOf(childId) === -1) {
      parent.childrenIds.push(childId);
    }
    parent.childrenLoaded = true;
  };

  HierarchyStore.prototype.rebuildSelectedPath = function () {
    var path = [];
    var seen = {};
    var currentId = this.selectedId ? String(this.selectedId) : "";
    while (currentId && this.nodesById[currentId] && !seen[currentId]) {
      seen[currentId] = true;
      path.push(currentId);
      currentId = this.nodesById[currentId].parentId
        ? String(this.nodesById[currentId].parentId)
        : "";
    }
    path.reverse();
    this.selectedPath = path;
  };

  HierarchyStore.prototype.loadSelectedProperties = function (nodeId) {
    var self = this;
    var requestId;
    var selectedNode;
    if (!nodeId || !this.nodesById[nodeId]) {
      this.clearProperties();
      this.emit();
      return Promise.resolve();
    }

    selectedNode = this.nodesById[nodeId];
    requestId = ++this.propertiesRequestId;
    this.propertiesLoading = true;
    this.propertiesError = "";
    this.propertiesTargetId = String(nodeId);
    this.propertiesTitle = selectedNode.name || String(nodeId);
    this.propertiesMessage = "Loading properties...";
    this.emit();

    return this.apiAdapter
      .fetchNodeProperties(nodeId)
      .then(function (result) {
        if (requestId !== self.propertiesRequestId) return;
        self.propertyGroups = (result && result.groups) || [];
        self.propertiesLoading = false;
        self.propertiesError = "";
        self.propertiesTitle =
          (result && result.node && result.node.name) ||
          (self.nodesById[nodeId] && self.nodesById[nodeId].name) ||
          String(nodeId);
        self.propertiesTargetId = String(nodeId);
        self.propertiesMessage =
          (result && result.message) ||
          (self.propertyGroups.length ? "" : "No IFC properties found for this object");
        self.emit();
      })
      .catch(function (err) {
        if (requestId !== self.propertiesRequestId) return;
        self.propertyGroups = [];
        self.propertiesLoading = false;
        self.propertiesError = err && err.message ? err.message : "Failed to load object properties";
        self.propertiesMessage = self.propertiesError;
        self.emit();
      });
  };

  HierarchyStore.prototype.selectNode = function (nodeId) {
    if (!this.nodesById[nodeId]) return Promise.resolve();
    this.selectedId = String(nodeId);
    this.rebuildSelectedPath();
    this.statusMessage = "Selected: " + (this.nodesById[nodeId].name || nodeId);
    this.emit();
    return this.loadSelectedProperties(nodeId);
  };

  HierarchyStore.prototype.reloadTree = function (initialStatus) {
    var self = this;
    this.error = "";
    this.statusMessage = initialStatus || "Loading IFC hierarchy...";
    this.emit();
    return this.apiAdapter
      .fetchRoot()
      .then(function (root) {
        var rootNode = self.upsertNode(root, null);
        rootNode.childrenLoaded = false;
        self.rootId = rootNode.id;
        self.expanded[rootNode.id] = true;
        self.emit();
        return self.loadChildren(rootNode.id);
      })
      .then(function () {
        return self.expandToDepth(4);
      })
      .then(function () {
        self.statusMessage = "Ready";
        self.emit();
      })
      .catch(function (err) {
        self.error = err && err.message ? err.message : "Failed to initialize";
        self.statusMessage = self.error;
        self.emit();
      });
  };

  HierarchyStore.prototype.init = function () {
    return this.reloadTree("Loading IFC hierarchy...");
  };

  HierarchyStore.prototype.loadIfcFiles = function (files) {
    var self = this;
    this.error = "";
    this.statusMessage = "Loading selected IFC files...";
    this.emit();
    return this.apiAdapter
      .loadIfcFiles(files)
      .then(function (summary) {
        self.resetTreeState();
        return self.reloadTree("Loading IFC hierarchy...").then(function () {
          self.statusMessage = "Loaded " + formatIfcSummary(summary);
          self.emit();
        });
      })
      .catch(function (err) {
        self.error = err && err.message ? err.message : "Failed to load IFC files";
        self.statusMessage = self.error;
        self.emit();
      });
  };

  HierarchyStore.prototype.clearIfcFiles = function () {
    var self = this;
    this.error = "";
    this.statusMessage = "Clearing IFC files...";
    this.emit();
    return this.apiAdapter
      .clearUploadedIfcFiles()
      .then(function (summary) {
        self.resetTreeState();
        return self.reloadTree("Loading IFC hierarchy...").then(function () {
          self.statusMessage = summary && summary.sourceCount
            ? "Loaded " + formatIfcSummary(summary)
            : "Cleared IFC files";
          self.emit();
        });
      })
      .catch(function (err) {
        self.error = err && err.message ? err.message : "Failed to clear IFC files";
        self.statusMessage = self.error;
        self.emit();
      });
  };

  HierarchyStore.prototype.toggle = function (nodeId) {
    if (!this.nodesById[nodeId]) return Promise.resolve();
    this.expanded[nodeId] = !this.expanded[nodeId];
    this.emit();
    if (this.expanded[nodeId]) return this.loadChildren(nodeId);
    return Promise.resolve();
  };

  HierarchyStore.prototype.loadChildren = function (nodeId) {
    var self = this;
    var node = this.nodesById[nodeId];
    if (!node || !node.hasChildren) return Promise.resolve([]);
    if (node.childrenLoaded) return Promise.resolve(node.childrenIds);
    if (this.loading[nodeId]) return Promise.resolve([]);

    this.loading[nodeId] = true;
    this.emit();

    return this.apiAdapter
      .fetchChildren(node)
      .then(function (children) {
        var ids = [];
        (children || []).forEach(function (child) {
          var row = self.upsertNode(child, nodeId);
          ids.push(row.id);
        });
        node.childrenIds = ids;
        node.childrenLoaded = true;
        self.loading[nodeId] = false;
        self.emit();
        return ids;
      })
      .catch(function (err) {
        self.loading[nodeId] = false;
        self.error = err && err.message ? err.message : "Failed to load children";
        self.statusMessage = self.error;
        self.emit();
        return [];
      });
  };

  HierarchyStore.prototype.expandToDepth = function (maxDepth) {
    var self = this;
    function visit(nodeId, depth) {
      var node = self.nodesById[nodeId];
      if (!node || !node.hasChildren || depth >= maxDepth) return Promise.resolve();
      self.expanded[nodeId] = true;
      return self.loadChildren(nodeId).then(function (childIds) {
        return childIds.reduce(function (promise, childId) {
          return promise.then(function () {
            return visit(childId, depth + 1);
          });
        }, Promise.resolve());
      });
    }

    if (!this.rootId) return Promise.resolve();
    this.statusMessage = "Expanding hierarchy...";
    this.emit();
    return visit(this.rootId, 0).then(function () {
      self.statusMessage = self.selectedId
        ? "Selected: " + ((self.nodesById[self.selectedId] && self.nodesById[self.selectedId].name) || self.selectedId)
        : "Ready";
      self.emit();
    });
  };

  HierarchyStore.prototype.collapseAll = function () {
    this.expanded = {};
    this.focusedPathIds = [];
    if (this.rootId) this.expanded[this.rootId] = true;
    this.emit();
  };

  HierarchyStore.prototype.collapsePreviousFocusPath = function (nextPathIds) {
    var previous = this.focusedPathIds || [];
    var next = nextPathIds || [];
    var common = 0;
    var i;
    var nodeId;
    while (common < previous.length && common < next.length && previous[common] === next[common]) {
      common += 1;
    }
    for (i = previous.length - 1; i >= common; i -= 1) {
      nodeId = previous[i];
      if (!nodeId || nodeId === this.rootId) continue;
      if (this.nodesById[nodeId] && this.nodesById[nodeId].hasChildren) {
        this.expanded[nodeId] = false;
      }
    }
    this.focusedPathIds = next.slice();
  };

  HierarchyStore.prototype.focusPickedObject = function (picked) {
    var self = this;
    this.error = "";
    this.statusMessage = "Resolving selected object...";
    this.emit();
    Promise.resolve(this.apiAdapter.highlightPickedObject(picked)).catch(function () {});
    return this.apiAdapter
      .resolvePickedObjectPath(picked)
      .then(function (result) {
        var path = (result && result.path) || [];
        var parentId = self.rootId;
        var nextFocusedPathIds;
        var i;
        if (!parentId) return;

        if (!path.length) {
          self.selectedId = "";
          self.selectedPath = [];
          self.clearProperties((result && result.message) || "Selected object is not present in the loaded IFC hierarchy");
          self.statusMessage = (result && result.message) || "Selected object is not present in the loaded IFC hierarchy";
          self.emit();
          return;
        }

        nextFocusedPathIds = [String(parentId)].concat(path.map(function (node) {
          return String(node.id);
        }));
        self.collapsePreviousFocusPath(nextFocusedPathIds);

        self.expanded[parentId] = true;
        for (i = 0; i < path.length; i++) {
          var row = self.upsertNode(path[i], parentId);
          self.ensureChildLink(parentId, row.id);
          self.expanded[row.id] = true;
          parentId = row.id;
        }

        self.selectedId = result && result.selectedId ? String(result.selectedId) : "";
        self.rebuildSelectedPath();
        self.statusMessage = self.selectedId
          ? "Selected: " + ((self.nodesById[self.selectedId] && self.nodesById[self.selectedId].name) || self.selectedId)
          : "Object resolved";
        self.emit();
        return self.loadSelectedProperties(self.selectedId);
      })
      .catch(function (err) {
        self.error = err && err.message ? err.message : "Failed to resolve selected object";
        self.statusMessage = self.error;
        self.emit();
      });
  };

  global.HierarchyStore = HierarchyStore;
})(window);
