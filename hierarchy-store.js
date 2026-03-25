(function (global) {
  "use strict";

  function HierarchyStore(apiAdapter) {
    this.apiAdapter = apiAdapter;
    this.nodesById = {};
    this.rootId = null;
    this.expanded = {};
    this.loading = {};
    this.error = "";
    this.statusMessage = "Initializing...";
    this.selectedId = "";
    this.capabilities = apiAdapter.probeCapabilities();
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
      statusMessage: this.statusMessage,
      selectedId: this.selectedId,
      capabilities: this.capabilities,
    };
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

  HierarchyStore.prototype.init = function () {
    var self = this;
    this.error = "";
    this.statusMessage = "Loading root...";
    this.emit();
    return this.apiAdapter
      .fetchRoot()
      .then(function (root) {
        var rootNode = self.upsertNode(root, null);
        rootNode.childrenLoaded = false;
        self.rootId = rootNode.id;
        self.expanded[rootNode.id] = true;
        self.statusMessage = "Loading hierarchy...";
        self.emit();
        return self.loadChildren(rootNode.id);
      })
      .then(function () {
        self.statusMessage = "Ready. Click an object in StreamBIM to focus its path.";
        self.emit();
      })
      .catch(function (err) {
        self.error = err && err.message ? err.message : "Failed to initialize";
        self.statusMessage = self.error;
        self.emit();
      });
  };

  HierarchyStore.prototype.toggle = function (nodeId) {
    if (!this.nodesById[nodeId]) return;
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

  HierarchyStore.prototype.focusPickedObject = function (picked) {
    var self = this;
    this.error = "";
    this.statusMessage = "Resolving selected object...";
    this.emit();
    return this.apiAdapter
      .resolvePickedObjectPath(picked)
      .then(function (result) {
        var path = (result && result.path) || [];
        var parentId = self.rootId;
        var i;
        if (!parentId) return;

        self.expanded[parentId] = true;
        for (i = 0; i < path.length; i++) {
          var row = self.upsertNode(path[i], parentId);
          self.ensureChildLink(parentId, row.id);
          self.expanded[row.id] = true;
          parentId = row.id;
        }

        self.selectedId = result && result.selectedId ? String(result.selectedId) : "";
        self.statusMessage = self.selectedId
          ? "Focused selected object: " + self.selectedId
          : "Clicked object resolved";
        self.emit();
      })
      .catch(function (err) {
        self.error = err && err.message ? err.message : "Failed to resolve selected object";
        self.statusMessage = self.error;
        self.emit();
      });
  };

  global.HierarchyStore = HierarchyStore;
})(window);
