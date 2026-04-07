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

  function normalizeIdentityToken(value) {
    return String(value == null ? "" : value)
      .trim()
      .replace(/^T~/, "");
  }

  function appendNormalizedIdentityTokens(values) {
    var expanded = [];
    asArray(values).forEach(function (value) {
      var raw = value == null ? "" : String(value).trim();
      var normalized = normalizeIdentityToken(raw);
      if (raw) expanded.push(raw);
      if (normalized && normalized !== raw) expanded.push(normalized);
    });
    return uniqueStrings(expanded);
  }

  function compactObject(source) {
    var output = {};
    Object.keys(source || {}).forEach(function (key) {
      if (source[key] == null) return;
      if (typeof source[key] === "string" && !String(source[key]).trim()) return;
      output[key] = source[key];
    });
    return output;
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
    var endIndex;
    var j;
    var ch;
    while (i < slice.length) {
      hash = slice.indexOf("#", i);
      if (hash < 0) break;
      eq = slice.indexOf("=", hash);
      if (eq < 0) break;
      depth = 0;
      inString = false;
      endIndex = -1;
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
          endIndex = j;
          break;
        }
      }
      if (endIndex < 0) break;
      records.push(slice.slice(hash, endIndex + 1).trim());
      i = endIndex + 1;
    }
    return records;
  }

  function extractStepRefs(input) {
    return String(input || "").match(/#\d+/g) || [];
  }

  function normalizeIfcScalar(token) {
    var trimmed = String(token || "").trim();
    if (!trimmed) return "";
    if (/^[+-]?\d+(?:\.\d+)?(?:E[+-]?\d+)?$/i.test(trimmed)) {
      return trimmed.replace(/(\.\d*?)0+$/g, "$1").replace(/\.$/, "");
    }
    return trimmed;
  }

  function parseIfcValueToken(token) {
    var trimmed = String(token == null ? "" : token).trim();
    var match;
    var values;
    if (!trimmed || trimmed === "$" || trimmed === "*") return "";
    if (trimmed.charAt(0) === "'" && trimmed.charAt(trimmed.length - 1) === "'") {
      return decodeIfcStringToken(trimmed);
    }
    if (/^\.(T|F|U)\.$/i.test(trimmed)) {
      if (/^\.T\.$/i.test(trimmed)) return "true";
      if (/^\.F\.$/i.test(trimmed)) return "false";
      return "unknown";
    }
    if (trimmed.charAt(0) === "(" && trimmed.charAt(trimmed.length - 1) === ")") {
      values = splitTopLevel(trimmed.slice(1, -1))
        .map(parseIfcValueToken)
        .filter(Boolean);
      return values.join(", ");
    }
    match = trimmed.match(/^([A-Z0-9_]+)\(([\s\S]*)\)$/i);
    if (match) {
      values = splitTopLevel(match[2])
        .map(parseIfcValueToken)
        .filter(Boolean);
      if (!values.length) return "";
      return values.length === 1 ? values[0] : values.join(", ");
    }
    return normalizeIfcScalar(trimmed);
  }

  function createPropertyEntry(name, value, valueType, options) {
    var opts = options || {};
    return {
      name: firstString(name, "Unnamed"),
      value: value == null || String(value).trim() === "" ? "-" : String(value).trim(),
      valueType: valueType || "",
      filterName: firstString(opts.filterName, name, "Unnamed"),
      filterable: opts.filterable !== false,
    };
  }

  function buildPropertyItem(entityName, args) {
    var name = decodeIfcStringToken(args[0]) || normalizeIfcClass(entityName);
    var value = "";
    var upper = String(entityName || "").toUpperCase();
    if (entityName === "IFCPROPERTYSINGLEVALUE") {
      return createPropertyEntry(name, parseIfcValueToken(args[2]), "single");
    }
    if (entityName === "IFCPROPERTYENUMERATEDVALUE") {
      return createPropertyEntry(name, parseIfcValueToken(args[2]), "enumeration");
    }
    if (entityName === "IFCPROPERTYLISTVALUE") {
      return createPropertyEntry(name, parseIfcValueToken(args[2]), "list");
    }
    if (entityName === "IFCPROPERTYBOUNDEDVALUE") {
      value = [
        parseIfcValueToken(args[3]) ? "min " + parseIfcValueToken(args[3]) : "",
        parseIfcValueToken(args[2]) ? "max " + parseIfcValueToken(args[2]) : "",
        parseIfcValueToken(args[4]) ? "set " + parseIfcValueToken(args[4]) : "",
      ]
        .filter(Boolean)
        .join(" / ");
      return createPropertyEntry(name, value, "bounded");
    }
    if (entityName === "IFCPROPERTYREFERENCEVALUE") {
      value = firstString(
        parseIfcValueToken(args[3]),
        parseIfcValueToken(args[2]),
        parseIfcValueToken(args[4])
      );
      return createPropertyEntry(name, value, "reference");
    }
    if (entityName === "IFCPROPERTYTABLEVALUE") {
      value = firstString(parseIfcValueToken(args[2]), parseIfcValueToken(args[3]));
      return createPropertyEntry(name, value, "table");
    }
    if (upper.indexOf("IFCQUANTITY") === 0) {
      return createPropertyEntry(name, parseIfcValueToken(args[3]), "quantity");
    }
    return null;
  }

  function flattenPropertyRefs(refs, propertyItemsByStep, prefix, trail, output) {
    asArray(refs).forEach(function (ref) {
      var key = String(prefix || "") + "::" + String(ref || "");
      var propertyItem;
      var childPrefix;
      if (!ref || trail[key]) return;
      trail[key] = true;
      propertyItem = propertyItemsByStep[String(ref)];
      if (!propertyItem) return;
      if (propertyItem.kind === "group") {
        childPrefix = firstString(prefix, "")
          ? prefix + " / " + propertyItem.name
          : propertyItem.name;
        flattenPropertyRefs(propertyItem.refs, propertyItemsByStep, childPrefix, trail, output);
        return;
      }
      output.push(
        createPropertyEntry(
          firstString(prefix, "")
            ? prefix + " / " + propertyItem.name
            : propertyItem.name,
          propertyItem.value,
          propertyItem.valueType,
          { filterName: propertyItem.name, filterable: true }
        )
      );
    });
  }

  function clonePropertyGroup(group) {
    return {
      id: group && group.id ? String(group.id) : "",
      name: firstString(group && group.name, "Property Set"),
      groupType: firstString(group && group.groupType, "property-set"),
      items: asArray(group && group.items).map(function (item) {
        return createPropertyEntry(item && item.name, item && item.value, item && item.valueType, {
          filterName: item && item.filterName,
          filterable: item && item.filterable !== false,
        });
      }),
    };
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

  function buildIfcClassGroupId(parentId, ifcClass) {
    return (
      "ifc-class-group::" +
      encodeURIComponent(String(parentId || "")) +
      "::" +
      encodeURIComponent(firstString(ifcClass, "Unclassified"))
    );
  }

  function parseIfcClassGroupId(nodeId) {
    var match = String(nodeId || "").match(/^ifc-class-group::([^:]+)::(.+)$/);
    if (!match) return null;
    return {
      parentId: decodeURIComponent(match[1]),
      ifcClass: decodeURIComponent(match[2]),
    };
  }

  function isStoreyIndexedNode(node) {
    return !!(node && (node.type === "storey" || node.ifcClass === "IfcBuildingStorey"));
  }

  function groupedIfcClassName(node) {
    return firstString(node && node.ifcClass, "Unclassified");
  }

  function isGroupableIndexedChild(parentNode, childNode) {
    return !!(isStoreyIndexedNode(parentNode) && childNode && childNode.type === "element");
  }

  function parseIfcRecords(records) {
    var entities = {};
    var parentByStep = {};
    var childrenByStep = {};
    var propertyGroupStepsByObjectStep = {};
    var propertyItemsByStep = {};
    var propertyDefinitionsByStep = {};

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
      var definitionRef;
      if (!match) return;
      stepId = "#" + match[1];
      entityName = String(match[2]).trim().toUpperCase();
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
        childRefs = extractStepRefs(args[5]);
        childRefs.forEach(function (childRef) {
          parentByStep[childRef] = parentRef;
          childrenByStep[parentRef] = childrenByStep[parentRef] || [];
          if (childrenByStep[parentRef].indexOf(childRef) === -1) {
            childrenByStep[parentRef].push(childRef);
          }
        });
      }

      if (entityName === "IFCRELCONTAINEDINSPATIALSTRUCTURE") {
        childRefs = extractStepRefs(args[4]);
        parentRef = String(args[5] || "").trim();
        childRefs.forEach(function (childRef) {
          if (!parentByStep[childRef]) parentByStep[childRef] = parentRef;
          childrenByStep[parentRef] = childrenByStep[parentRef] || [];
          if (childrenByStep[parentRef].indexOf(childRef) === -1) {
            childrenByStep[parentRef].push(childRef);
          }
        });
      }

      if (entityName === "IFCRELDEFINESBYPROPERTIES") {
        childRefs = extractStepRefs(args[4]);
        definitionRef = String(args[5] || "").trim();
        childRefs.forEach(function (childRef) {
          propertyGroupStepsByObjectStep[childRef] = propertyGroupStepsByObjectStep[childRef] || [];
          if (definitionRef && propertyGroupStepsByObjectStep[childRef].indexOf(definitionRef) === -1) {
            propertyGroupStepsByObjectStep[childRef].push(definitionRef);
          }
        });
      }
    });

    Object.keys(entities).forEach(function (stepId) {
      var entity = entities[stepId];
      var args = entity.args || [];
      var propertyItem;
      if (entity.entityName === "IFCPROPERTYCOMPLEXPROPERTY") {
        propertyItemsByStep[stepId] = {
          kind: "group",
          name: firstString(decodeIfcStringToken(args[0]), "Complex Property"),
          refs: extractStepRefs(args[3]),
        };
        return;
      }
      if (entity.entityName === "IFCPHYSICALCOMPLEXQUANTITY") {
        propertyItemsByStep[stepId] = {
          kind: "group",
          name: firstString(decodeIfcStringToken(args[0]), "Complex Quantity"),
          refs: extractStepRefs(args[2]),
        };
        return;
      }
      propertyItem = buildPropertyItem(entity.entityName, args);
      if (propertyItem) {
        propertyItemsByStep[stepId] = {
          kind: "item",
          name: propertyItem.name,
          value: propertyItem.value,
          valueType: propertyItem.valueType,
        };
      }
    });

    Object.keys(entities).forEach(function (stepId) {
      var entity = entities[stepId];
      var args = entity.args || [];
      var refs = [];
      var items = [];
      var groupType = "";
      if (entity.entityName === "IFCPROPERTYSET") {
        refs = extractStepRefs(args[4]);
        groupType = "property-set";
      } else if (entity.entityName === "IFCELEMENTQUANTITY") {
        refs = extractStepRefs(args[5]);
        groupType = "quantity-set";
      } else {
        return;
      }
      flattenPropertyRefs(refs, propertyItemsByStep, "", {}, items);
      propertyDefinitionsByStep[stepId] = {
        id: stepId,
        name: firstString(decodeIfcStringToken(args[2]), normalizeIfcClass(entity.entityName)),
        groupType: groupType,
        items: items,
      };
    });

    return {
      entities: entities,
      parentByStep: parentByStep,
      childrenByStep: childrenByStep,
      propertyDefinitionsByStep: propertyDefinitionsByStep,
      propertyGroupStepsByObjectStep: propertyGroupStepsByObjectStep,
    };
  }

  function buildObjectPropertyGroups(stepId, propertyGroupStepsByObjectStep, propertyDefinitionsByStep) {
    var groups = [];
    var seen = {};
    asArray(propertyGroupStepsByObjectStep && propertyGroupStepsByObjectStep[stepId]).forEach(function (groupStep) {
      var definition = propertyDefinitionsByStep && propertyDefinitionsByStep[groupStep];
      if (!definition || seen[groupStep]) return;
      seen[groupStep] = true;
      groups.push(clonePropertyGroup(definition));
    });
    return groups;
  }

  function buildIfcIndex(parsed, sourceFile) {
    var entities = parsed.entities || {};
    var parentByStep = parsed.parentByStep || {};
    var childrenByStep = parsed.childrenByStep || {};
    var propertyDefinitionsByStep = parsed.propertyDefinitionsByStep || {};
    var propertyGroupStepsByObjectStep = parsed.propertyGroupStepsByObjectStep || {};
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
        propertyGroups: buildObjectPropertyGroups(stepId, propertyGroupStepsByObjectStep, propertyDefinitionsByStep),
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
          propertyGroups: asArray(sourceNode.propertyGroups).map(clonePropertyGroup),
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

  function looksLikeIfcText(text) {
    var sample = String(text || "").slice(0, 4096).toUpperCase();
    if (!sample) return false;
    return sample.indexOf("ISO-10303-21") >= 0 ||
      (sample.indexOf("DATA;") >= 0 && sample.indexOf("ENDSEC;") >= 0 && sample.indexOf("IFC") >= 0);
  }

  function normalizeApiResponseBody(response) {
    var parsed;
    if (response == null) return null;
    if (typeof response === "string") {
      parsed = String(response).trim();
      if (!parsed) return "";
      if (
        (parsed.charAt(0) === "{" && parsed.charAt(parsed.length - 1) === "}") ||
        (parsed.charAt(0) === "[" && parsed.charAt(parsed.length - 1) === "]")
      ) {
        try {
          return JSON.parse(parsed);
        } catch (err) {}
      }
      return response;
    }
    if (typeof response === "object") {
      if (typeof response.body === "string" || typeof response.text === "string") {
        return normalizeApiResponseBody(response.body != null ? response.body : response.text);
      }
      if (response.data != null && typeof response.data !== "object") {
        return normalizeApiResponseBody(response.data);
      }
    }
    return response;
  }

  function extractTextFromApiResponse(response) {
    var body = normalizeApiResponseBody(response);
    if (typeof body === "string") return body;
    if (body && typeof body.body === "string") return body.body;
    if (body && typeof body.text === "string") return body.text;
    if (body && typeof body.data === "string") return body.data;
    return "";
  }

  function collectMatchingStrings(source, matcher, output, depth, seen) {
    var list = output || [];
    var currentDepth = depth || 0;
    var references = seen || [];
    if (source == null || currentDepth > 5) return list;
    if (typeof source === "string") {
      if (matcher("", source, null)) list.push(source);
      return list;
    }
    if (typeof source !== "object") return list;
    if (references.indexOf(source) >= 0) return list;
    references.push(source);
    if (Array.isArray(source)) {
      source.forEach(function (item) {
        collectMatchingStrings(item, matcher, list, currentDepth + 1, references);
      });
      return list;
    }
    Object.keys(source).forEach(function (key) {
      var value = source[key];
      if (typeof value === "string") {
        if (matcher(key, value, source)) list.push(value);
        return;
      }
      collectMatchingStrings(value, matcher, list, currentDepth + 1, references);
    });
    return list;
  }

  function toApiTarget(value) {
    var target = firstString(value);
    if (!target) return "";
    if (/^https?:\/\//i.test(target)) return target;
    if (target.charAt(0) === "/") return target;
    if (target.indexOf("api/") === 0 || target.indexOf("pgw/") === 0) return "/" + target;
    return "";
  }

  function HierarchyApi(api) {
    this.api = api || null;
    this.uploadedIfcIndexes = [];
    this.modelLayerIfcIndexes = [];
    this.mergedIfcIndex = null;
    this.mergedIfcIndexPromise = null;
    this.projectIdValue = "";
    this.projectIdPromise = null;
    this.modelLayerSyncPromise = null;
    this.modelLayerSyncMessage = "";
    this.modelLayerSyncError = "";
  }
  HierarchyApi.prototype.getViewerApi = function () {
    var connectedApi = this.api || {};
    var runtimeApi = global && global.StreamBIM && typeof global.StreamBIM === "object" ? global.StreamBIM : {};
    return {
      highlightObject:
        typeof runtimeApi.highlightObject === "function"
          ? runtimeApi.highlightObject.bind(runtimeApi)
          : typeof connectedApi.highlightObject === "function"
          ? connectedApi.highlightObject.bind(connectedApi)
          : null,
      deHighlightAllObjects:
        typeof runtimeApi.deHighlightAllObjects === "function"
          ? runtimeApi.deHighlightAllObjects.bind(runtimeApi)
          : typeof connectedApi.deHighlightAllObjects === "function"
          ? connectedApi.deHighlightAllObjects.bind(connectedApi)
          : null,
    };
  };
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
      getLayers: typeof a.getLayers === "function",
      makeApiRequest: typeof a.makeApiRequest === "function",
      modelLayerSync: typeof a.makeApiRequest === "function",
      localIfcUpload: true,
    };
  };


  HierarchyApi.prototype.getAllIfcIndexes = function () {
    return this.modelLayerIfcIndexes.concat(this.uploadedIfcIndexes);
  };

  HierarchyApi.prototype.getIfcIndexSummary = function () {
    var summary = {
      sourceCount: 0,
      sourceFiles: [],
      uploadedCount: 0,
      layerCount: 0,
      modelLayerMessage: this.modelLayerSyncMessage,
      modelLayerError: this.modelLayerSyncError,
    };
    this.modelLayerIfcIndexes.forEach(function (index) {
      if (!index) return;
      summary.layerCount += 1;
      if (index.sourceFile) summary.sourceFiles.push(index.sourceFile);
    });
    this.uploadedIfcIndexes.forEach(function (index) {
      if (!index) return;
      summary.uploadedCount += 1;
      if (index.sourceFile) summary.sourceFiles.push(index.sourceFile);
    });
    summary.sourceFiles = uniqueStrings(summary.sourceFiles);
    summary.sourceCount = summary.sourceFiles.length;
    return summary;
  };

  HierarchyApi.prototype.getProjectId = function () {
    var self = this;
    var api = this.api || {};
    if (this.projectIdValue) return Promise.resolve(this.projectIdValue);
    if (this.projectIdPromise) return this.projectIdPromise;
    if (typeof api.getProjectId !== "function") return Promise.resolve("");
    this.projectIdPromise = api.getProjectId()
      .then(function (projectId) {
        self.projectIdValue = firstString(projectId);
        self.projectIdPromise = null;
        return self.projectIdValue;
      })
      .catch(function () {
        self.projectIdPromise = null;
        return "";
      });
    return this.projectIdPromise;
  };

  HierarchyApi.prototype.expandApiTargets = function (target) {
    var normalized = toApiTarget(target) || firstString(target);
    if (!normalized) return Promise.resolve([]);
    if (/^https?:\/\//i.test(normalized) || normalized.indexOf("/pgw/") === 0) {
      return Promise.resolve([normalized]);
    }
    return this.getProjectId().then(function (projectId) {
      var targets = [normalized];
      if (projectId && normalized.indexOf("/api/") === 0) {
        targets.push("/pgw/" + projectId + normalized);
        if (String(projectId).indexOf("project-") === 0) {
          targets.push("/pgw/" + String(projectId).replace(/^project-/, "") + normalized);
        } else {
          targets.push("/pgw/project-" + projectId + normalized);
        }
      }
      return uniqueStrings(targets);
    });
  };

  HierarchyApi.prototype.makeApiRequestRaw = function (request) {
    var api = this.api || {};
    var target = firstString(request && request.url, request && request.path);
    var accept = firstString(request && request.accept, nestedValue(request, ["headers", "Accept"]));
    var contentType = firstString(request && request.contentType, nestedValue(request, ["headers", "Content-Type"]));
    if (!target || typeof api.makeApiRequest !== "function") {
      return Promise.reject(new Error("StreamBIM widget API does not expose makeApiRequest"));
    }
    return api.makeApiRequest({
      method: firstString(request && request.method, "GET"),
      url: target,
      path: target,
      accept: accept || undefined,
      contentType: contentType || undefined,
      headers: request && request.headers ? request.headers : undefined,
      body: request && request.body != null ? request.body : undefined,
    });
  };

  HierarchyApi.prototype.requestTextTarget = function (target) {
    var self = this;
    var accept = "text/plain,application/octet-stream,application/step,text/html,*/*";

    function fetchDirect(url) {
      if (typeof fetch !== "function") {
        return Promise.reject(new Error("This browser does not expose fetch"));
      }
      return fetch(url, { credentials: "include" }).then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.text();
      });
    }

    return this.expandApiTargets(target).then(function (targets) {
      var index = 0;
      function next(lastError) {
        var candidate = targets[index++];
        if (!candidate) {
          if (/^https?:\/\//i.test(String(target || ""))) {
            return fetchDirect(String(target));
          }
          return Promise.reject(lastError || new Error("No request target available"));
        }
        return self.makeApiRequestRaw({ method: "GET", url: candidate, accept: accept }).then(
          function (response) {
            return extractTextFromApiResponse(response) || "";
          },
          function (err) {
            return next(err);
          }
        );
      }
      return next();
    });
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
          var index = buildIfcIndexFromText(text, firstString(file && file.name, "uploaded.ifc"));
          index.sourceKind = "local-upload";
          return index;
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
      self.mergedIfcIndex = mergeIfcIndexes(self.getAllIfcIndexes());
      return self.mergedIfcIndex;
    });

    return this.mergedIfcIndexPromise;
  };

  HierarchyApi.prototype.listModelLayerCollectionPaths = function () {
    return [
      "/api/v1/model-layers",
      "/api/v1/model_layers",
      "/api/v1/layers",
      "/api/v1/3d-layers",
      "/api/v1/layer-trees",
      "/api/v1/layer_trees",
      "/api/v1/v2/model-layers",
      "/api/v1/v2/model_layers",
      "/api/v1/v2/layers",
    ];
  };

  HierarchyApi.prototype.deriveModelLayerDownloadTargets = function (row, collectionPath) {
    var raw = (row && row.raw) || {};
    var layerId = firstString(row && row.id);
    var basePath = firstString(collectionPath).replace(/\/$/, "");
    var explicitTargets = uniqueStrings(
      collectMatchingStrings([row, raw, raw.attributes, raw.links, raw.relationships, raw.meta], function (key, value) {
        var lowerKey = String(key || "").toLowerCase();
        var lowerValue = String(value || "").toLowerCase();
        if (!lowerValue) return false;
        return (
          (/download|url|uri|href|path|file/.test(lowerKey) &&
            (/\.ifc(?:$|[?#])/.test(lowerValue) ||
              /\/download(?:$|[/?#])/.test(lowerValue) ||
              /\/file(?:$|[/?#])/.test(lowerValue) ||
              /\/files?(?:$|[/?#])/.test(lowerValue) ||
              /\/documents?(?:$|[/?#])/.test(lowerValue) ||
              /^https?:\/\//.test(lowerValue))) ||
          (/\.ifc(?:$|[?#])/.test(lowerValue) && /self|related/.test(lowerKey))
        );
      })
        .map(toApiTarget)
        .filter(Boolean)
    );
    var guessedTargets = [];
    if (layerId) {
      ["/api/v1/model-layers/", "/api/v1/model_layers/", "/api/v1/layers/", "/api/v1/3d-layers/", "/api/v1/v2/model-layers/", "/api/v1/v2/model_layers/", "/api/v1/v2/layers/"]
        .forEach(function (prefix) {
          var encodedId = encodeURIComponent(layerId);
          guessedTargets.push(prefix + encodedId + "/download");
          guessedTargets.push(prefix + encodedId + "/file");
          guessedTargets.push(prefix + encodedId + "/source");
          guessedTargets.push(prefix + encodedId + "/source-file");
          guessedTargets.push(prefix + encodedId + "/ifc");
        });
      if (basePath) {
        guessedTargets.push(basePath + "/" + encodeURIComponent(layerId));
        guessedTargets.push(basePath + "/" + encodeURIComponent(layerId) + "/download");
        guessedTargets.push(basePath + "/" + encodeURIComponent(layerId) + "/file");
      }
    }
    return uniqueStrings(explicitTargets.concat(guessedTargets));
  };

  HierarchyApi.prototype.buildModelLayerSource = function (row, collectionPath, index) {
    var raw = (row && row.raw) || {};
    var attributes = raw.attributes || {};
    var layerId = firstString(row && row.id, "layer-" + index);
    var layerName = firstString(row && row.name, attributes.name, attributes.title, attributes.label, "Model layer " + (index + 1));
    var sourceFile = firstString(
      attributes.sourceFileName,
      attributes["source-file-name"],
      attributes.originalFileName,
      attributes["original-file-name"],
      attributes.fileName,
      attributes["file-name"],
      attributes.filename,
      attributes.name,
      row && row.name,
      layerName
    );
    var downloadTargets = this.deriveModelLayerDownloadTargets(row, collectionPath);
    var hints = uniqueStrings([
      collectionPath,
      row && row.type,
      layerName,
      sourceFile,
      pickFromSources([attributes, raw], ["kind", "mimeType", "mime-type", "format", "extension", "ext", "fileType", "file-type", "layerType", "layer-type", "modelType", "model-type", "category"]),
    ]);
    var lowerHints = hints.join(" ").toLowerCase();
    var looksIfc = lowerHints.indexOf("ifc") >= 0 || /\.ifc(?:$|[?#])/i.test(sourceFile) || downloadTargets.some(function (target) {
      return /\.ifc(?:$|[?#])/i.test(target);
    });
    var looksModel = /model|layer|3d/.test(lowerHints) && !/pdf|dwg|image|raster|map/.test(lowerHints);
    if (!downloadTargets.length) return null;
    if (!looksIfc && !looksModel) return null;
    return {
      layerId: layerId,
      layerName: layerName,
      sourceFile: sourceFile,
      collectionPath: collectionPath,
      downloadTargets: downloadTargets,
    };
  };

  HierarchyApi.prototype.buildModelLayerSourcesFromRows = function (rows, collectionPath) {
    var self = this;
    var seen = {};
    return asArray(rows)
      .map(function (row, index) {
        return self.buildModelLayerSource(row, collectionPath, index);
      })
      .filter(function (source) {
        var key;
        if (!source) return false;
        key = firstString(source.layerId, source.sourceFile, source.downloadTargets[0]) + "|" + firstString(source.downloadTargets[0]);
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      });
  };

  HierarchyApi.prototype.findModelLayerSources = function () {
    var self = this;
    var collectionPaths = this.listModelLayerCollectionPaths();
    return collectionPaths
      .reduce(function (promise, collectionPath) {
        return promise.then(function (sources) {
          return self.tryJsonApiCollection(collectionPath).then(function (rows) {
            return sources.concat(self.buildModelLayerSourcesFromRows(rows, collectionPath));
          });
        });
      }, Promise.resolve([]))
      .then(function (sources) {
        var seen = {};
        return sources.filter(function (source) {
          var key = firstString(source.sourceFile, source.layerId, source.downloadTargets[0]) + "|" + source.downloadTargets.join("|");
          if (seen[key]) return false;
          seen[key] = true;
          return true;
        });
      });
  };

  HierarchyApi.prototype.loadIfcIndexFromLayerSource = function (source) {
    var self = this;
    var targets = asArray(source && source.downloadTargets);
    function next(index, lastError) {
      var target = targets[index];
      if (!target) {
        return Promise.reject(lastError || new Error("No IFC download target resolved for model layer"));
      }
      return self.requestTextTarget(target).then(
        function (text) {
          var indexData;
          if (!looksLikeIfcText(text)) {
            return next(index + 1, new Error("Response did not contain IFC text"));
          }
          indexData = buildIfcIndexFromText(text, firstString(source && source.sourceFile, source && source.layerName, "model-layer.ifc"));
          if (!indexData || !indexData.rootId) {
            return next(index + 1, new Error("Downloaded IFC source did not contain a readable hierarchy"));
          }
          indexData.sourceKind = "model-layer";
          indexData.layerId = firstString(source && source.layerId);
          indexData.layerName = firstString(source && source.layerName, source && source.sourceFile);
          indexData.sourceTarget = target;
          return indexData;
        },
        function (err) {
          return next(index + 1, err);
        }
      );
    }
    return next(0);
  };

  HierarchyApi.prototype.syncIfcSources = function (force) {
    var self = this;
    var api = this.api || {};
    if (this.modelLayerSyncPromise && !force) return this.modelLayerSyncPromise;
    if (typeof api.makeApiRequest !== "function") {
      this.modelLayerSyncMessage = "";
      this.modelLayerSyncError = "";
      return Promise.resolve(this.getIfcIndexSummary());
    }
    this.modelLayerSyncError = "";
    this.modelLayerSyncMessage = "Checking StreamBIM model layers...";
    this.modelLayerSyncPromise = this.findModelLayerSources()
      .then(function (sources) {
        var loaded = [];
        var skipped = [];
        function next(index) {
          if (index >= sources.length) return Promise.resolve();
          return self.loadIfcIndexFromLayerSource(sources[index]).then(
            function (ifcIndex) {
              if (ifcIndex) loaded.push(ifcIndex);
            },
            function () {
              skipped.push(sources[index]);
            }
          ).then(function () {
            return next(index + 1);
          });
        }
        return next(0).then(function () {
          self.modelLayerIfcIndexes = loaded;
          self.invalidateIfcIndex();
          if (!sources.length) {
            self.modelLayerSyncMessage = "No IFC model layers with downloadable source found in this project";
          } else if (loaded.length) {
            self.modelLayerSyncMessage = skipped.length
              ? "Loaded " + loaded.length + " IFC model layer" + (loaded.length === 1 ? "" : "s") + ", skipped " + skipped.length
              : "Loaded " + loaded.length + " IFC model layer" + (loaded.length === 1 ? "" : "s");
          } else {
            self.modelLayerSyncMessage = "Found model layers, but none exposed downloadable IFC source";
          }
          return self.loadIfcIndex().then(function () {
            return self.getIfcIndexSummary();
          });
        });
      })
      .catch(function (err) {
        self.modelLayerSyncError = err && err.message ? err.message : "Failed to inspect StreamBIM model layers";
        self.modelLayerSyncMessage = "";
        return self.getIfcIndexSummary();
      })
      .then(function (summary) {
        self.modelLayerSyncPromise = null;
        return summary;
      }, function (err) {
        self.modelLayerSyncPromise = null;
        throw err;
      });
    return this.modelLayerSyncPromise;
  };

  HierarchyApi.prototype.mapIndexedNode = function (indexedNode) {
    if (!indexedNode) return null;
    return {
      id: String(indexedNode.id),
      type: indexedNode.type || "element",
      name: firstString(indexedNode.name, indexedNode.ifcClass, indexedNode.id),
      hasChildren: asArray(indexedNode.childrenIds).length > 0,
      meta: {
        source: indexedNode.sourceKind || "ifc-index",
        objectId: firstString(indexedNode.guid, indexedNode.id),
        ifcClass: indexedNode.ifcClass,
        stepId: indexedNode.stepId,
        sourceFile: indexedNode.sourceFile,
        raw: indexedNode,
      },
    };
  };

  HierarchyApi.prototype.getIndexedChildNodes = function (index, parentIndexedNode) {
    return asArray(parentIndexedNode && parentIndexedNode.childrenIds)
      .map(function (childId) {
        return index && index.nodes ? index.nodes[String(childId)] : null;
      })
      .filter(Boolean);
  };

  HierarchyApi.prototype.getIfcClassGroupingForIndexedNode = function (index, parentIndexedNode) {
    var childNodes = this.getIndexedChildNodes(index, parentIndexedNode);
    var groupsByClass = {};
    var groupOrder = [];
    var groupableCount = 0;

    if (!isStoreyIndexedNode(parentIndexedNode) || childNodes.length < 2) return null;

    childNodes.forEach(function (childNode) {
      var ifcClass;
      if (!isGroupableIndexedChild(parentIndexedNode, childNode)) return;
      ifcClass = groupedIfcClassName(childNode);
      if (!groupsByClass[ifcClass]) {
        groupsByClass[ifcClass] = [];
        groupOrder.push(ifcClass);
      }
      groupsByClass[ifcClass].push(childNode);
      groupableCount += 1;
    });

    if (groupableCount < 2 || !groupOrder.length) return null;

    return {
      childNodes: childNodes,
      groupsByClass: groupsByClass,
      groupOrder: groupOrder,
    };
  };

  HierarchyApi.prototype.createIfcClassGroupNode = function (parentIndexedNode, ifcClass, childNodes) {
    var children = asArray(childNodes).filter(Boolean);
    return {
      id: buildIfcClassGroupId(parentIndexedNode && parentIndexedNode.id, ifcClass),
      type: "ifc-class-group",
      name: firstString(ifcClass, "Unclassified"),
      hasChildren: children.length > 0,
      meta: {
        source: "ifc-class-group",
        groupedIfcClass: firstString(ifcClass, "Unclassified"),
        childCount: children.length,
        groupedChildIds: children.map(function (childNode) {
          return String(childNode.id);
        }),
        parentId: firstString(parentIndexedNode && parentIndexedNode.id),
        sourceFile: firstString(
          parentIndexedNode && parentIndexedNode.sourceFile,
          children[0] && children[0].sourceFile
        ),
      },
    };
  };

  HierarchyApi.prototype.resolveIfcClassGroupNode = function (index, nodeOrId) {
    var node = nodeOrId && typeof nodeOrId === "object" ? nodeOrId : null;
    var groupId = firstString(node && node.id, nodeOrId);
    var meta = (node && node.meta) || {};
    var parsed = parseIfcClassGroupId(groupId);
    var parentId = firstString(meta.parentId, parsed && parsed.parentId);
    var ifcClass = firstString(meta.groupedIfcClass, parsed && parsed.ifcClass, "Unclassified");
    var parentIndexedNode = index && index.nodes ? index.nodes[String(parentId)] : null;
    var grouping;
    var childNodes;

    if (!parentIndexedNode) return null;

    grouping = this.getIfcClassGroupingForIndexedNode(index, parentIndexedNode);
    if (!grouping || !grouping.groupsByClass[ifcClass]) return null;

    childNodes = grouping.groupsByClass[ifcClass];
    return {
      id: buildIfcClassGroupId(parentIndexedNode.id, ifcClass),
      ifcClass: ifcClass,
      parentNode: parentIndexedNode,
      childNodes: childNodes,
      node: this.createIfcClassGroupNode(parentIndexedNode, ifcClass, childNodes),
    };
  };

  HierarchyApi.prototype.fetchChildrenFromIfcIndex = function (node) {
    var self = this;
    return this.loadIfcIndex().then(function (index) {
      var indexedNode;
      var grouping;
      var emittedGroups = {};
      var groupInfo;
      if (!index || !index.nodes) return null;
      if (node && node.type === "ifc-class-group") {
        groupInfo = self.resolveIfcClassGroupNode(index, node);
        if (!groupInfo) return [];
        return groupInfo.childNodes
          .map(function (childNode) {
            return self.mapIndexedNode(childNode);
          })
          .filter(Boolean);
      }
      indexedNode = index.nodes[String(node && node.id)];
      if (!indexedNode) return null;
      grouping = self.getIfcClassGroupingForIndexedNode(index, indexedNode);
      if (!grouping) {
        return self.getIndexedChildNodes(index, indexedNode)
          .map(function (childNode) {
            return self.mapIndexedNode(childNode);
          })
          .filter(Boolean);
      }
      return grouping.childNodes
        .map(function (childNode) {
          var ifcClass;
          if (!isGroupableIndexedChild(indexedNode, childNode)) {
            return self.mapIndexedNode(childNode);
          }
          ifcClass = groupedIfcClassName(childNode);
          if (emittedGroups[ifcClass]) return null;
          emittedGroups[ifcClass] = true;
          return self.createIfcClassGroupNode(indexedNode, ifcClass, grouping.groupsByClass[ifcClass]);
        })
        .filter(Boolean);
    });
  };

  HierarchyApi.prototype.buildPathFromIndexedNode = function (index, nodeId) {
    var path = [];
    var seen = {};
    var currentId = String(nodeId || "");
    var currentNode;
    var parentId;
    var parentNode;
    var grouping;
    var ifcClass;
    while (currentId && index.nodes[currentId] && !seen[currentId]) {
      currentNode = index.nodes[currentId];
      seen[currentId] = true;
      path.push(this.mapIndexedNode(currentNode));
      parentId = currentNode.parentId ? String(currentNode.parentId) : "";
      parentNode = parentId && index.nodes[parentId] ? index.nodes[parentId] : null;
      if (parentNode) {
        grouping = this.getIfcClassGroupingForIndexedNode(index, parentNode);
        if (grouping && isGroupableIndexedChild(parentNode, currentNode)) {
          ifcClass = groupedIfcClassName(currentNode);
          if (grouping.groupsByClass[ifcClass]) {
            path.push(this.createIfcClassGroupNode(parentNode, ifcClass, grouping.groupsByClass[ifcClass]));
          }
        }
      }
      currentId = parentId;
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

  HierarchyApi.prototype.fetchNodeProperties = function (nodeId) {
    var self = this;
    return this.loadIfcIndex().then(function (index) {
      var indexedNode = index && index.nodes && index.nodes[String(nodeId)];
      var groupInfo;
      var groups = [];
      if (!indexedNode) {
        groupInfo = self.resolveIfcClassGroupNode(index, nodeId);
        if (groupInfo) {
          return {
            node: groupInfo.node,
            groups: [
              {
                id: "object::" + String(groupInfo.id),
                name: "Object type",
                groupType: "identity",
                items: [
                  createPropertyEntry("IFC class", groupInfo.ifcClass, "identity", { filterable: false }),
                  createPropertyEntry("Objects", String(groupInfo.childNodes.length), "identity", { filterable: false }),
                  createPropertyEntry(
                    "Parent",
                    firstString(groupInfo.parentNode.name, groupInfo.parentNode.ifcClass, groupInfo.parentNode.id),
                    "identity",
                    { filterable: false }
                  ),
                  createPropertyEntry(
                    "Source file",
                    firstString(groupInfo.node.meta && groupInfo.node.meta.sourceFile),
                    "identity",
                    { filterable: false }
                  ),
                ],
              },
            ],
            message: "Select an object inside this type group to inspect IFC properties",
          };
        }
        return {
          node: null,
          groups: [],
          message: "Selected object is not present in the available IFC sources",
        };
      }
      groups.push({
        id: "object::" + String(indexedNode.id),
        name: "Object",
        groupType: "identity",
        items: [
          createPropertyEntry("Name", indexedNode.name || "", "identity", { filterable: false }),
          createPropertyEntry("IFC class", indexedNode.ifcClass || indexedNode.type || "", "identity", { filterable: false }),
          createPropertyEntry("GlobalId", indexedNode.guid || "", "identity", { filterable: false }),
          createPropertyEntry("STEP id", indexedNode.stepId || "", "identity", { filterable: false }),
          createPropertyEntry("Source file", indexedNode.sourceFile || "", "identity", { filterable: false }),
        ],
      });
      asArray(indexedNode.propertyGroups).forEach(function (group) {
        groups.push(clonePropertyGroup(group));
      });
      return {
        node: self.mapIndexedNode(indexedNode),
        groups: groups,
        message: groups.length > 1 ? "" : "No IFC property sets found for this object",
      };
    });
  };

  HierarchyApi.prototype.applyPropertyFilter = function (nodeId, groupName, item) {
    var api = this.api || {};
    var propKey = firstString(item && item.filterName, item && item.name);
    var propValue = item && item.value != null ? String(item.value).trim() : "";
    var rule = {
      psetName: firstString(groupName),
      propKey: propKey,
      propValue: propValue,
      operator: "=",
    };

    if (typeof api.applyObjectSearch !== "function") {
      return Promise.reject(new Error("StreamBIM widget API does not expose applyObjectSearch"));
    }
    if (!rule.psetName || !rule.propKey || !rule.propValue || rule.propValue === "-") {
      return Promise.reject(new Error("Selected property is missing a searchable value"));
    }

    return Promise.resolve(
      typeof api.getBuildingId === "function" ? api.getBuildingId().catch(function () { return ""; }) : ""
    ).then(function (buildingId) {
      var query;
      if (buildingId) rule.buildingId = String(buildingId);
      query = {
        filter: { rules: [[rule]] },
        page: { limit: 1000, skip: 0 },
      };
      return api
        .applyObjectSearch(query, true)
        .then(function () {
          if (typeof api.setSearchVisualizationMode === "function") {
            return api.setSearchVisualizationMode("FADED").catch(function () {});
          }
        })
        .then(function () {
          return {
            groupName: rule.psetName,
            propKey: rule.propKey,
            propValue: rule.propValue,
          };
        });
    });
  };

  HierarchyApi.prototype.fetchRoot = function () {
    var self = this;
    return this.loadIfcIndex().then(function (index) {
      var emptyMessage;
      if (index && index.rootId && index.nodes && index.nodes[index.rootId]) {
        return self.mapIndexedNode(index.nodes[index.rootId]);
      }
      emptyMessage = self.modelLayerSyncError
        ? self.modelLayerSyncError
        : self.modelLayerSyncMessage
        ? self.modelLayerSyncMessage
        : typeof (self.api || {}).makeApiRequest === "function"
        ? "Sync model layers or add local IFC files to build the hierarchy"
        : "Add local IFC files to build the hierarchy";
      return {
        id: "note::ifc-source-required",
        type: "note",
        name: emptyMessage,
        hasChildren: false,
        meta: { source: "ifc-source-required" },
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

  HierarchyApi.prototype.normalizeObjectInfoPayload = function (source) {
    var normalized = source;
    if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
      return normalized;
    }
    if (
      normalized.data &&
      typeof normalized.data === "object" &&
      !Array.isArray(normalized.data)
    ) {
      normalized = Object.assign({}, normalized.data, {
        _jsonApiDocument: source,
      });
    }
    if (normalized.attributes && typeof normalized.attributes === "object") {
      normalized = Object.assign({}, normalized.attributes, normalized);
    }
    if (!normalized.guid) {
      normalized.guid = firstString(
        normalized.globalId,
        normalized.ifcGuid,
        normalized.GlobalId,
        nestedValue(normalized, ["properties", "Global Id"]),
        nestedValue(normalized, ["properties", "GlobalId"]),
        nestedValue(normalized, ["properties", "GUID"]),
        nestedValue(normalized, ["properties", "guid"])
      );
    }
    if (!normalized.id) {
      normalized.id = firstString(normalized.objectId, normalized.dbId, normalized.expressId);
    }
    return normalized;
  };

  HierarchyApi.prototype.extractObjectsFromInfoResponse = function (response) {
    var body = normalizeApiResponseBody(response);
    var rows = [];
    if (!body) return [];
    if (Array.isArray(body)) {
      rows = body;
    } else if (Array.isArray(body.items)) {
      rows = body.items;
    } else if (Array.isArray(body.objects)) {
      rows = body.objects;
    } else if (Array.isArray(body.results)) {
      rows = body.results;
    } else if (Array.isArray(body.rows)) {
      rows = body.rows;
    } else if (Array.isArray(body.data)) {
      rows = body.data;
    } else if (body && typeof body === "object") {
      rows = [body];
    }
    return rows
      .map(this.normalizeObjectInfoPayload.bind(this))
      .filter(Boolean);
  };

  HierarchyApi.prototype.extractIdentityTokensFromSources = function (sources) {
    var combinedSources = asArray(sources).concat(
      asArray(sources).map(function (source) {
        return source && source.properties ? source.properties : null;
      })
    );
    return appendNormalizedIdentityTokens([
      pickFromSources(combinedSources, ["guid", "globalId", "ifcGuid", "GlobalId"]),
      pickFromSources(combinedSources, ["objectGuid", "object-guid", "ifcObjectGuid"]),
      pickFromSources(combinedSources, ["id", "objectId", "dbId", "expressId"]),
      pickFromSources(combinedSources, ["Global Id", "GlobalId", "GUID", "guid"]),
    ]);
  };

  HierarchyApi.prototype.getSearchBuildingId = function () {
    var api = this.api || {};
    if (typeof api.getBuildingId !== "function") {
      return Promise.resolve("1000");
    }
    return api.getBuildingId()
      .then(function (buildingId) {
        return firstString(buildingId, "1000");
      })
      .catch(function () {
        return "1000";
      });
  };

  HierarchyApi.prototype.buildObjectInfoForSearchQueries = function (buildingId, identifiers) {
    var keys = ["GUID", "GlobalId", "Global Id", "ifcGuid", "id", "objectId"];
    var queries = [];
    var seen = {};
    appendNormalizedIdentityTokens(identifiers).forEach(function (value) {
      if (!value) return;
      queries.push(value);
      queries.push({ id: value });
      queries.push({ guid: value });
      keys.forEach(function (key) {
        queries.push({
          filter: { key: key, value: value },
          page: { limit: 1, skip: 0 },
          fieldUnion: true,
        });
        queries.push({
          filter: {
            rules: [[
              compactObject({
                buildingId: buildingId,
                propKey: key,
                propType: "str",
                propValue: value,
              }),
            ]],
          },
          page: { limit: 1, skip: 0 },
          fieldUnion: true,
        });
      });
    });
    return queries.filter(function (query) {
      var signature = typeof query === "string" ? query : JSON.stringify(query);
      if (seen[signature]) return false;
      seen[signature] = true;
      return true;
    });
  };

  HierarchyApi.prototype.selectBestMatchingObjectFromInfoResponse = function (response, identifiers, fallback) {
    var self = this;
    var objects = this.extractObjectsFromInfoResponse(response);
    var wanted = appendNormalizedIdentityTokens(
      asArray(identifiers).concat(
        this.extractIdentityTokensFromSources([
          fallback,
          fallback && fallback.raw,
          fallback && fallback.attributes,
          fallback && fallback.properties,
          nestedValue(fallback, ["data"]),
          nestedValue(fallback, ["data", "attributes"]),
        ])
      )
    );
    if (!objects.length) return null;
    if (!wanted.length) return objects[0];
    return (
      objects.find(function (object) {
        var tokens = appendNormalizedIdentityTokens(
          self.extractIdentityTokensFromSources([
            object,
            object && object.raw,
            object && object.attributes,
            object && object.properties,
            nestedValue(object, ["data"]),
            nestedValue(object, ["data", "attributes"]),
          ])
        );
        return tokens.some(function (token) {
          return wanted.indexOf(token) >= 0;
        });
      }) || objects[0]
    );
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
    return this.extractIdentityTokensFromSources(sources);
  };
  HierarchyApi.prototype.extractPickedHighlightGuids = function (picked) {
    var sources = [
      picked,
      nestedValue(picked, ["object"]),
      nestedValue(picked, ["item"]),
      nestedValue(picked, ["data"]),
      nestedValue(picked, ["data", "attributes"]),
      nestedValue(picked, ["selection"]),
    ];
    return appendNormalizedIdentityTokens([
      pickFromSources(sources, ["guid", "globalId", "ifcGuid", "GlobalId"]),
      pickFromSources(sources, ["objectGuid", "object-guid", "ifcObjectGuid"]),
      pickFromSources(sources, ["Global Id", "GlobalId", "GUID"]),
    ]);
  };
  HierarchyApi.prototype.bestEffortGetObjectInfoForSearch = function (picked) {
    var self = this;
    var api = this.api || {};
    var identifiers = this.extractPickedObjectCandidates(picked);
    var queryIndex = 0;
    if (typeof api.getObjectInfoForSearch !== "function") {
      return Promise.resolve(null);
    }
    return this.getSearchBuildingId()
      .then(function (buildingId) {
        var queries = self.buildObjectInfoForSearchQueries(buildingId, identifiers);
        function next() {
          var query = queries[queryIndex++];
          if (query == null) return Promise.resolve(null);
          return api.getObjectInfoForSearch(query).then(
            function (response) {
              var matched = self.selectBestMatchingObjectFromInfoResponse(response, identifiers, picked);
              if (matched) return matched;
              return next();
            },
            function () {
              return next();
            }
          );
        }
        return next();
      })
      .catch(function () {
        return null;
      });
  };

  HierarchyApi.prototype.bestEffortGetObjectInfo = function (picked) {
    var self = this;
    var api = this.api || {};
    var identifiers = this.extractPickedObjectCandidates(picked);
    var index = 0;

    function lookupViaGetObjectInfo() {
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
              detail: self.normalizeObjectInfoPayload(detail) || null,
              identifiers: identifiers,
              selectedId: identifier,
            };
          },
          function () {
            return next();
          }
        );
      }
      return next();
    }

    return this.bestEffortGetObjectInfoForSearch(picked)
      .then(function (searchDetail) {
        var normalizedSearchDetail;
        if (searchDetail) {
          normalizedSearchDetail = self.normalizeObjectInfoPayload(searchDetail);
          return {
            detail: normalizedSearchDetail,
            identifiers: appendNormalizedIdentityTokens(
              identifiers.concat(
                self.extractIdentityTokensFromSources([
                  normalizedSearchDetail,
                  normalizedSearchDetail && normalizedSearchDetail.raw,
                  normalizedSearchDetail && normalizedSearchDetail.attributes,
                  normalizedSearchDetail && normalizedSearchDetail.properties,
                  nestedValue(normalizedSearchDetail, ["data"]),
                  nestedValue(normalizedSearchDetail, ["data", "attributes"]),
                ])
              )
            ),
            selectedId: firstString(
              normalizedSearchDetail && normalizedSearchDetail.guid,
              normalizedSearchDetail && normalizedSearchDetail.id,
              identifiers[0]
            ),
          };
        }
        return lookupViaGetObjectInfo();
      })
      .then(function (result) {
        if (result.detail) return result;
        return {
          detail: null,
          identifiers: appendNormalizedIdentityTokens(identifiers),
          selectedId: firstString(identifiers[0]),
        };
      });
  };

  HierarchyApi.prototype.collectHighlightCandidates = function (picked, infoResult) {
    var result = infoResult || {};
    var detail = result.detail;
    var sources = [
      detail,
      detail && detail.raw,
      detail && detail.attributes,
      detail && detail.properties,
      nestedValue(detail, ["data"]),
      nestedValue(detail, ["data", "attributes"]),
      nestedValue(detail, ["object"]),
      nestedValue(detail, ["item"]),
      nestedValue(detail, ["result"]),
      nestedValue(detail, ["selection"]),
      picked,
      nestedValue(picked, ["object"]),
      nestedValue(picked, ["item"]),
      nestedValue(picked, ["data"]),
      nestedValue(picked, ["result"]),
      nestedValue(picked, ["selection"]),
    ];
    var ordered = this.extractIdentityTokensFromSources(sources).concat(
      appendNormalizedIdentityTokens([firstString(result && result.selectedId)])
    );

    asArray(result && result.identifiers).forEach(function (identifier) {
      ordered.push(identifier);
    });

    return appendNormalizedIdentityTokens(ordered);
  };

  HierarchyApi.prototype.highlightPickedObject = function (picked) {
    var viewerApi = this.getViewerApi();
    var self = this;
    if (typeof viewerApi.highlightObject !== "function") {
      return Promise.resolve("");
    }
    function applyHighlightCandidates(candidates) {
      var ordered = uniqueStrings(candidates);
      var index = 0;
      function next() {
        var target = firstString(ordered[index++]);
        if (!target) return Promise.resolve("");
        return viewerApi.highlightObject(target).then(
          function () {
            return target;
          },
          function () {
            return next();
          }
        );
      }
      return Promise.resolve(
        typeof viewerApi.deHighlightAllObjects === "function"
          ? viewerApi.deHighlightAllObjects().catch(function () {})
          : null
      ).then(function () {
        return next();
      });
    }
    return applyHighlightCandidates(this.extractPickedHighlightGuids(picked))
      .then(function (highlighted) {
        if (highlighted) return highlighted;
        return self.bestEffortGetObjectInfo(picked).then(function (result) {
          return applyHighlightCandidates(self.collectHighlightCandidates(picked, result));
        });
      })
      .catch(function () {
        return applyHighlightCandidates(
          self.collectHighlightCandidates(picked, {
            identifiers: self.extractPickedObjectCandidates(picked),
          })
        );
      })
      .catch(function () {
        return "";
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
          result && result.detail && result.detail.properties,
          result && result.detail && nestedValue(result.detail, ["data"]),
          result && result.detail && nestedValue(result.detail, ["data", "attributes"]),
        ];
        var detailIdentifiers = appendNormalizedIdentityTokens(
          pickedIdentifiers.concat(
            result && result.identifiers,
            self.extractIdentityTokensFromSources(detailSources)
          )
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
              ? "Selected object is not present in the available IFC sources"
              : "Sync model layers or add local IFC files before selecting objects",
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
    var self = this;
    return this.expandApiTargets(path)
      .then(function (targets) {
        var index = 0;
        function next() {
          var target = targets[index++];
          if (!target) return Promise.resolve([]);
          return self
            .makeApiRequestRaw({
              method: "GET",
              url: target,
              accept: "application/vnd.api+json",
            })
            .then(function (response) {
              var body = normalizeApiResponseBody(response);
              var rows = asArray(
                body && body.data != null
                  ? body.data
                  : body && body.items != null
                  ? body.items
                  : body && body.results != null
                  ? body.results
                  : Array.isArray(body)
                  ? body
                  : []
              ).map(mapJsonApiRow);
              if (rows.length) return rows;
              return next();
            })
            .catch(function () {
              return next();
            });
        }
        return next();
      })
      .catch(function () {
        return [];
      });
  };

  global.HierarchyApi = HierarchyApi;
})(window);


