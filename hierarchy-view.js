(function (global) {
  "use strict";

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function iconForNode(node) {
    var type = node && node.type ? String(node.type) : "node";
    if (type === "model") return "▦";
    if (type === "project") return "⌘";
    if (type === "site") return "⌂";
    if (type === "building") return "▤";
    if (type === "storey") return "≡";
    if (type === "note") return "!";
    return "◻";
  }

  function detailForNode(node) {
    if (!node) return "";
    if (node.meta && node.meta.ifcClass) return String(node.meta.ifcClass);
    if (node.type === "model" && node.meta && node.meta.sourceFile) return String(node.meta.sourceFile);
    if (node.type === "project") return "IfcProject";
    if (node.type === "site") return "IfcSite";
    if (node.type === "building") return "IfcBuilding";
    if (node.type === "storey") return "IfcBuildingStorey";
    return "";
  }

  function renderNode(state, nodeId, depth, handlers) {
    var node = state.nodesById[nodeId];
    var row;
    var expanded;
    var isLoading;
    var inSelectedPath;
    var toggle;
    var item;
    var icon;
    var title;
    var detail;
    var loading;
    var fragment;

    if (!node) return null;

    row = el("div", "tree-row");
    row.style.paddingLeft = String(depth * 18 + 8) + "px";
    row.setAttribute("data-node-id", nodeId);

    expanded = !!state.expanded[nodeId];
    isLoading = !!state.loading[nodeId];
    inSelectedPath = state.selectedPath.indexOf(nodeId) >= 0;

    if (node.hasChildren) {
      toggle = el("button", "tree-toggle", expanded ? "▾" : "▸");
      toggle.onclick = function (event) {
        event.stopPropagation();
        handlers.onToggle(nodeId);
      };
      row.appendChild(toggle);
    } else {
      row.appendChild(el("span", "tree-spacer", ""));
    }

    item = el("button", "tree-item");
    if (inSelectedPath) item.className += " tree-item-in-path";
    if (state.selectedId && String(state.selectedId) === String(nodeId)) {
      item.className += " tree-item-selected";
    }
    item.onclick = function () {
      handlers.onSelect(node);
    };

    icon = el("span", "tree-icon tree-icon-" + node.type, iconForNode(node));
    item.appendChild(icon);

    title = el("span", "tree-title", node.name || node.id);
    item.appendChild(title);

    detail = detailForNode(node);
    if (detail) {
      item.appendChild(el("span", "tree-detail", detail));
    }

    if (isLoading) {
      loading = el("span", "tree-loading", "loading");
      item.appendChild(loading);
    }

    if (node.meta && node.meta.objectId) {
      item.title = String(node.meta.objectId);
    }

    row.appendChild(item);

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
    this.metaEl = document.getElementById("meta");
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

    this.treeEl.innerHTML = "";
    this.statusEl.textContent = state.statusMessage || "Ready";
    this.statusEl.className = state.error ? "footer-status err" : "footer-status ok";

    Object.keys(state.capabilities).forEach(function (key) {
      if (state.capabilities[key]) caps.push(key);
    });
    this.metaEl.textContent = "API";
    this.metaEl.title = "Capabilities: " + (caps.join(", ") || "none");

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
