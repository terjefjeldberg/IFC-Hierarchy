(function (global) {
  "use strict";

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function iconMarkupForNode(node) {
    var type = node && node.type ? String(node.type) : "node";
    if (type === "model") {
      return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.75h5.5L13 5.25v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z"></path><path d="M9.5 1.75v3.5H13"></path></svg>';
    }
    if (type === "project") {
      return '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="4" height="4"></rect><rect x="10" y="2" width="4" height="4"></rect><rect x="2" y="10" width="4" height="4"></rect><rect x="10" y="10" width="4" height="4"></rect></svg>';
    }
    if (type === "site") {
      return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 12.5 5.5 11l5 1.5L14 11v-7L10.5 5.5l-5-1.5L2 5.5Z"></path><path d="M5.5 4v7"></path><path d="M10.5 5.5v7"></path></svg>';
    }
    if (type === "building") {
      return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 14.25V2.75h7v11.5"></path><path d="M10 6.25h3v8"></path><path d="M5.25 5.25h1.5"></path><path d="M5.25 8h1.5"></path><path d="M5.25 10.75h1.5"></path><path d="M2 14.25h12"></path></svg>';
    }
    if (type === "storey") {
      return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.25h10"></path><path d="M3 8h10"></path><path d="M3 11.75h10"></path><path d="M4.5 2.75v10.5"></path></svg>';
    }
    if (type === "workspace") {
      return '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="3"></rect><rect x="2" y="7.5" width="12" height="3"></rect><rect x="2" y="12" width="12" height="1.5"></rect></svg>';
    }
    if (type === "note") {
      return '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.75"></circle><path d="M8 5v3.5"></path><path d="M8 11.5h.01"></path></svg>';
    }
    return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.75 13 4.5v7L8 14.25 3 11.5v-7Z"></path><path d="M8 1.75v12.5"></path><path d="M3 4.5 8 7.25l5-2.75"></path></svg>';
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
      toggle = el("button", "tree-toggle", expanded ? "v" : ">");
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

    icon = el("span", "tree-icon tree-icon-" + node.type);
    icon.innerHTML = iconMarkupForNode(node);
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

  function renderTreeContent(state, handlers) {
    var root = state.rootId && state.nodesById[state.rootId];
    var fragment = document.createDocumentFragment();

    if (!root) return null;

    if (root.type === "workspace" && root.childrenIds && root.childrenIds.length) {
      root.childrenIds.forEach(function (childId) {
        var child = renderNode(state, childId, 0, handlers);
        if (child) fragment.appendChild(child);
      });
      return fragment;
    }

    return renderNode(state, root.id, 0, handlers);
  }

  function capabilityList(capabilities) {
    var keys = [];
    Object.keys(capabilities || {}).forEach(function (key) {
      if (capabilities[key]) keys.push(key);
    });
    return keys;
  }

  function formatIfcSummary(summary) {
    var count = summary && summary.sourceCount ? summary.sourceCount : 0;
    if (!count) return "No IFC loaded";
    return count === 1 ? "1 IFC loaded" : count + " IFC loaded";
  }

  function appendPropertyCell(row, className, text, clickable, onClick) {
    var cell;
    if (clickable) {
      cell = el("button", className + " property-cell-button property-cell-clickable", text || "-");
      cell.type = "button";
      cell.title = "Apply this property filter in StreamBIM";
      cell.onclick = function (event) {
        event.stopPropagation();
        onClick();
      };
    } else {
      cell = el("div", className + " property-cell-readonly", text || "-");
    }
    row.appendChild(cell);
  }

  function renderProperties(view, state) {
    var container = view.propertiesEl;
    var selectedNode = state.selectedId && state.nodesById[state.selectedId];
    var titleRow;
    var heading;
    var subtitle;
    var helper;
    var info;

    container.innerHTML = "";

    titleRow = el("div", "properties-top");
    heading = el("div", "properties-heading-wrap");
    heading.appendChild(el("div", "properties-label", "Properties"));
    heading.appendChild(
      el(
        "div",
        "properties-title",
        state.propertiesTitle || (selectedNode && selectedNode.name) || "No object selected"
      )
    );
    helper = el(
      "div",
      "properties-helper",
      selectedNode
        ? "Orange property names and values can be applied as StreamBIM filters."
        : "Select an IFC object in StreamBIM to inspect its property sets and values."
    );
    heading.appendChild(helper);
    titleRow.appendChild(heading);

    subtitle = el(
      "div",
      "properties-subtitle",
      selectedNode ? detailForNode(selectedNode) || "IFC object" : "No object selected"
    );
    titleRow.appendChild(subtitle);
    container.appendChild(titleRow);

    if (!state.selectedId) {
      container.appendChild(
        el("div", "properties-empty", "Select an IFC object in StreamBIM to inspect its property sets and values.")
      );
      return;
    }

    if (state.propertiesLoading) {
      container.appendChild(el("div", "properties-empty", "Loading properties..."));
      return;
    }

    if (state.propertiesError) {
      info = el("div", "properties-empty properties-error", state.propertiesError);
      container.appendChild(info);
      return;
    }

    if (state.propertiesMessage && !state.propertyGroups.length) {
      container.appendChild(el("div", "properties-empty", state.propertiesMessage));
      return;
    }

    state.propertyGroups.forEach(function (group, index) {
      var groupId = String(group.id || "group-" + index);
      var isCollapsed = !!view.collapsedPropertyGroups[groupId];
      var itemCount = (group.items || []).length;
      var card = el("section", "property-group");
      var header = el("button", "property-group-header");
      var title = el("div", "property-group-title", group.name || "Property Set");
      var meta = el("div", "property-group-meta", "(" + itemCount + ")");
      var body = el("div", "property-group-body");
      var caret = el("span", "property-group-caret", isCollapsed ? ">" : "v");

      header.appendChild(title);
      header.appendChild(meta);
      header.appendChild(caret);
      header.onclick = function () {
        view.collapsedPropertyGroups[groupId] = !view.collapsedPropertyGroups[groupId];
        view.render(view.lastState);
      };
      card.appendChild(header);

      if (!isCollapsed) {
        (group.items || []).forEach(function (item) {
          var row;
          var canFilter =
            group.groupType !== "identity" &&
            item &&
            item.filterable !== false &&
            item.value &&
            item.value !== "-";
          row = el("div", "property-row " + (canFilter ? "property-row-filterable" : "property-row-readonly"));
          appendPropertyCell(row, "property-name", item.name || "Unnamed", canFilter, function () {
            view.applyPropertyFilter(state.selectedId, group, item);
          });
          appendPropertyCell(row, "property-value", item.value || "-", canFilter, function () {
            view.applyPropertyFilter(state.selectedId, group, item);
          });
          body.appendChild(row);
        });
        if (!(group.items || []).length) {
          body.appendChild(el("div", "properties-empty", "No values in this group."));
        }
        card.appendChild(body);
      }

      container.appendChild(card);
    });
  }

  function HierarchyView(rootEl, store, api) {
    this.rootEl = rootEl;
    this.store = store;
    this.api = api || {};
    this.statusEl = document.getElementById("status");
    this.metaEl = document.getElementById("meta");
    this.ifcSummaryEl = document.getElementById("ifc-summary");
    this.treeEl = document.getElementById("tree");
    this.propertiesEl = document.getElementById("properties");
    this.collapseBtn = document.getElementById("collapse-all");
    this.expand2Btn = document.getElementById("expand-2");
    this.expand4Btn = document.getElementById("expand-4");
    this.loadBtn = document.getElementById("load-ifc");
    this.clearBtn = document.getElementById("clear-ifc");
    this.fileInput = document.getElementById("ifc-files");
    this.collapsedPropertyGroups = {};
    this.lastPropertyTargetId = "";
    this.lastState = null;
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
    if (this.loadBtn && this.fileInput) {
      this.loadBtn.onclick = function () {
        self.fileInput.click();
      };
      this.fileInput.onchange = function (event) {
        var files = Array.prototype.slice.call((event.target && event.target.files) || []);
        if (files.length) self.store.loadIfcFiles(files);
        self.fileInput.value = "";
      };
    }
    if (this.clearBtn) {
      this.clearBtn.onclick = function () {
        self.store.clearIfcFiles();
      };
    }
  };

  HierarchyView.prototype.render = function (state) {
    var self = this;
    var caps = capabilityList(state.capabilities);
    var ifcSummary = state.ifcSummary || { sourceCount: 0, sourceFiles: [] };
    var tooltipLines = [];
    var content;

    this.lastState = state;
    if (state.propertiesTargetId !== this.lastPropertyTargetId) {
      this.collapsedPropertyGroups = {};
      this.lastPropertyTargetId = state.propertiesTargetId;
    }

    this.treeEl.innerHTML = "";
    this.statusEl.textContent = state.statusMessage || "Ready";
    this.statusEl.className = state.error ? "footer-status err" : "footer-status ok";

    if (this.ifcSummaryEl) {
      this.ifcSummaryEl.textContent = formatIfcSummary(ifcSummary);
      this.ifcSummaryEl.title = (ifcSummary.sourceFiles || []).join("\n") || "No IFC sources loaded";
    }

    tooltipLines.push("IFC sources: " + ((ifcSummary.sourceFiles || []).join(", ") || "none"));
    tooltipLines.push("Capabilities: " + (caps.join(", ") || "none"));
    this.metaEl.textContent = (ifcSummary.sourceCount || 0) + " IFC";
    this.metaEl.title = tooltipLines.join("\n");

    if (this.clearBtn) {
      this.clearBtn.disabled = !(ifcSummary.uploadedCount > 0);
    }

    if (state.rootId) {
      content = renderTreeContent(state, {
        onToggle: this.store.toggle.bind(this.store),
        onSelect: this.onSelectNode.bind(this),
      });
      if (content) this.treeEl.appendChild(content);
    }

    renderProperties(this, state);

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

  HierarchyView.prototype.applyPropertyFilter = function (nodeId, group, item) {
    var self = this;
    this.store.setStatusMessage(
      "Applying filter: " + String((group && group.name) || "Property Set") + " / " + String((item && item.filterName) || (item && item.name) || "Value") + " = " + String((item && item.value) || ""),
      false
    );
    return this.store.apiAdapter
      .applyPropertyFilter(nodeId, group && group.name, item)
      .then(function (result) {
        self.store.setStatusMessage(
          "Filter applied: " + result.groupName + " / " + result.propKey + " = " + result.propValue,
          false
        );
      })
      .catch(function (err) {
        self.store.setStatusMessage(err && err.message ? err.message : "Failed to apply StreamBIM filter", true);
      });
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
