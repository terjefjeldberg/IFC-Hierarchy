(function (global) {
  "use strict";

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function prettyType(node) {
    var ifcClass = node && node.meta && node.meta.ifcClass ? String(node.meta.ifcClass) : "";
    if (ifcClass) return ifcClass;
    if (!node || !node.type) return "Node";
    return String(node.type).charAt(0).toUpperCase() + String(node.type).slice(1);
  }

  function renderNode(state, nodeId, depth, handlers) {
    var node = state.nodesById[nodeId];
    var row;
    var expanded;
    var isLoading;
    var inSelectedPath;
    var toggle;
    var card;
    var badge;
    var name;
    var meta;
    var fragment;

    if (!node) return null;

    row = el("div", "tree-row");
    row.style.setProperty("--depth", String(depth));
    row.setAttribute("data-node-id", nodeId);

    expanded = !!state.expanded[nodeId];
    isLoading = !!state.loading[nodeId];
    inSelectedPath = state.selectedPath.indexOf(nodeId) >= 0;

    if (node.hasChildren) {
      toggle = el("button", "tree-toggle", expanded ? "▾" : "▸");
      toggle.onclick = function () {
        handlers.onToggle(nodeId);
      };
      row.appendChild(toggle);
    } else {
      row.appendChild(el("span", "tree-spacer", ""));
    }

    card = el("button", "tree-card tree-card-" + node.type);
    if (inSelectedPath) card.className += " tree-card-in-path";
    if (state.selectedId && String(state.selectedId) === String(nodeId)) {
      card.className += " tree-card-selected";
    }
    card.onclick = function () {
      handlers.onSelect(node);
    };

    badge = el("span", "tree-kind", prettyType(node));
    card.appendChild(badge);

    name = el("span", "tree-name", node.name || node.id);
    card.appendChild(name);

    if (node.meta && node.meta.objectId) {
      card.title = node.meta.objectId;
    }

    if (isLoading) {
      card.appendChild(el("span", "tree-loading", "loading"));
    }

    row.appendChild(card);

    fragment = document.createDocumentFragment();
    fragment.appendChild(row);

    if (expanded && node.childrenIds && node.childrenIds.length) {
      node.childrenIds.forEach(function (childId) {
        var child = renderNode(state, childId, depth + 1, handlers);
        if (child) fragment.appendChild(child);
      });
    }

    return fragment;
  }

  function HierarchyView(rootEl, store, api) {
    this.rootEl = rootEl;
    this.store = store;
    this.api = api || {};
    this.statusEl = document.getElementById("status");
    this.capEl = document.getElementById("capabilities");
    this.pathEl = document.getElementById("selection-path");
    this.treeEl = document.getElementById("tree");
    this.collapseBtn = document.getElementById("collapse-all");
    this.expand2Btn = document.getElementById("expand-2");
    this.expand4Btn = document.getElementById("expand-4");
    this.bind();
  }

  HierarchyView.prototype.bind = function () {
    var self = this;
    this.store.onChange = function (state) {
      self.render(state);
    };
    if (this.collapseBtn) {
      this.collapseBtn.onclick = function () {
        self.store.collapseAll();
      };
    }
    if (this.expand2Btn) {
      this.expand2Btn.onclick = function () {
        self.store.expandToDepth(2);
      };
    }
    if (this.expand4Btn) {
      this.expand4Btn.onclick = function () {
        self.store.expandToDepth(4);
      };
    }
  };

  HierarchyView.prototype.render = function (state) {
    var self = this;
    var caps = [];
    var content;
    var pathLabel = "No object selected";

    this.treeEl.innerHTML = "";
    this.statusEl.textContent = state.statusMessage || "Ready";
    this.statusEl.className = state.error ? "status err" : "status ok";

    Object.keys(state.capabilities).forEach(function (key) {
      if (state.capabilities[key]) caps.push(key);
    });
    this.capEl.textContent = "Capabilities: " + (caps.join(", ") || "none");

    if (state.selectedPath && state.selectedPath.length) {
      pathLabel = state.selectedPath
        .map(function (nodeId) {
          var node = state.nodesById[nodeId];
          return node ? node.name : nodeId;
        })
        .join(" > ");
    }
    this.pathEl.textContent = pathLabel;

    if (!state.rootId) return;
    content = renderNode(state, state.rootId, 0, {
      onToggle: this.store.toggle.bind(this.store),
      onSelect: this.onSelectNode.bind(this),
    });
    if (content) this.treeEl.appendChild(content);

    if (state.selectedId) {
      setTimeout(function () {
        var selected = self.treeEl.querySelector(
          '[data-node-id="' + String(state.selectedId).replace(/"/g, "") + '"]'
        );
        if (selected && typeof selected.scrollIntoView === "function") {
          selected.scrollIntoView({ block: "nearest" });
        }
      }, 0);
    }
  };

  HierarchyView.prototype.onSelectNode = function (node) {
    var api = this.api;
    var objectId = (node.meta && node.meta.objectId) || node.id;
    this.store.selectNode(node.id);
    if (node.type !== "element") return;
    if (typeof api.highlightObject === "function") {
      api.highlightObject(objectId).catch(function () {});
    }
    if (typeof api.gotoObject === "function") {
      api.gotoObject(objectId).catch(function () {});
    }
  };

  global.HierarchyView = HierarchyView;
})(window);

