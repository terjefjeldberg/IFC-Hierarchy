(function (global) {
  "use strict";

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderNode(state, nodeId, depth, handlers) {
    var node = state.nodesById[nodeId];
    if (!node) return null;

    var row = el("div", "tree-row");
    row.style.paddingLeft = String(depth * 14 + 8) + "px";
    row.setAttribute("data-node-id", nodeId);

    var expanded = !!state.expanded[nodeId];
    var isLoading = !!state.loading[nodeId];

    if (node.hasChildren) {
      var toggle = el("button", "tree-toggle", expanded ? "-" : "+");
      toggle.onclick = function () {
        handlers.onToggle(nodeId);
      };
      row.appendChild(toggle);
    } else {
      row.appendChild(el("span", "tree-spacer", " "));
    }

    var className = "tree-label tree-label-" + node.type;
    if (state.selectedId && String(state.selectedId) === String(nodeId)) {
      className += " tree-label-selected";
    }
    var label = el(
      "button",
      className,
      "[" + node.type.toUpperCase() + "] " + node.name
    );
    label.onclick = function () {
      handlers.onSelect(node);
    };
    row.appendChild(label);

    var source = node.meta && node.meta.source ? node.meta.source : "";
    if (source) row.appendChild(el("span", "tree-source", source));
    if (isLoading) row.appendChild(el("span", "tree-loading", "loading..."));

    var fragment = document.createDocumentFragment();
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
    this.treeEl = document.getElementById("tree");
    this.capEl = document.getElementById("capabilities");
    this.bind();
  }

  HierarchyView.prototype.bind = function () {
    var self = this;
    this.store.onChange = function (state) {
      self.render(state);
    };
  };

  HierarchyView.prototype.render = function (state) {
    var self = this;
    this.treeEl.innerHTML = "";
    this.statusEl.textContent = state.error || state.statusMessage || "Ready";
    this.statusEl.className = state.error ? "status err" : "status ok";

    var caps = [];
    Object.keys(state.capabilities).forEach(function (key) {
      if (state.capabilities[key]) caps.push(key);
    });
    this.capEl.textContent = "Capabilities: " + (caps.join(", ") || "none");

    if (!state.rootId) return;
    var content = renderNode(state, state.rootId, 0, {
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
