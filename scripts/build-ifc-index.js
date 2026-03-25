const fs = require("fs");
const path = require("path");

function readArgs() {
  const input = process.argv[2];
  const output = process.argv[3] || path.join(process.cwd(), "hierarchy-index.json");
  if (!input) {
    throw new Error("Usage: node scripts/build-ifc-index.js <input.ifc> [output.json]");
  }
  return { input: path.resolve(input), output: path.resolve(output) };
}

function decodeIfcStringToken(token) {
  if (!token || token === "$" || token === "*") return "";
  const trimmed = String(token).trim();
  if (!(trimmed.startsWith("'") && trimmed.endsWith("'"))) return "";
  let value = trimmed.slice(1, -1).replace(/''/g, "'");
  value = value.replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, (_, hex) => {
    const chars = [];
    for (let i = 0; i + 3 < hex.length; i += 4) {
      chars.push(String.fromCharCode(parseInt(hex.slice(i, i + 4), 16)));
    }
    return chars.join("");
  });
  value = value.replace(/\\X\\([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return value.trim();
}

function splitTopLevel(input) {
  const parts = [];
  let current = "";
  let depth = 0;
  let inString = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inString) {
      current += ch;
      if (ch === "'" && input[i + 1] === "'") {
        current += input[i + 1];
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

function extractRecords(text) {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const dataStart = clean.indexOf("DATA;");
  const dataEnd = clean.lastIndexOf("ENDSEC;");
  const slice = dataStart >= 0 && dataEnd > dataStart ? clean.slice(dataStart + 5, dataEnd) : clean;
  const records = [];
  let i = 0;
  while (i < slice.length) {
    const hash = slice.indexOf("#", i);
    if (hash < 0) break;
    const eq = slice.indexOf("=", hash);
    if (eq < 0) break;
    let depth = 0;
    let inString = false;
    let end = -1;
    for (let j = eq + 1; j < slice.length; j += 1) {
      const ch = slice[j];
      if (inString) {
        if (ch === "'" && slice[j + 1] === "'") {
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
  const upper = String(entityName || "").toUpperCase();
  const overrides = {
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
    IFCEARTHWORKSFILL: "IfcEarthworksFill"
  };
  if (overrides[upper]) return overrides[upper];
  if (!upper.startsWith("IFC")) return String(entityName || "");
  return "Ifc" + upper.slice(3).toLowerCase().replace(/(^|_)([a-z])/g, (_, prefix, ch) => ch.toUpperCase());
}

function nodeTypeForClass(ifcClass) {
  if (ifcClass === "IfcProject") return "project";
  if (ifcClass === "IfcSite") return "site";
  if (ifcClass === "IfcBuilding") return "building";
  if (ifcClass === "IfcBuildingStorey") return "storey";
  return "element";
}

function parseEntityRecords(records) {
  const entities = new Map();
  const parentByStep = new Map();
  const childrenByStep = new Map();

  records.forEach((record) => {
    const match = record.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\((.*)\);$/is);
    if (!match) return;
    const stepId = `#${match[1]}`;
    const entityName = match[2].trim();
    const args = splitTopLevel(match[3]);

    const guid = decodeIfcStringToken(args[0]);
    const name = decodeIfcStringToken(args[2]);
    const ifcClass = normalizeIfcClass(entityName);

    entities.set(stepId, {
      stepId,
      entityName,
      ifcClass,
      guid,
      name,
      args,
    });

    if (entityName === "IFCRELAGGREGATES") {
      const parentRef = String(args[4] || "").trim();
      const childRefs = String(args[5] || "").match(/#\d+/g) || [];
      childRefs.forEach((childRef) => {
        parentByStep.set(childRef, parentRef);
        const list = childrenByStep.get(parentRef) || [];
        list.push(childRef);
        childrenByStep.set(parentRef, list);
      });
    }

    if (entityName === "IFCRELCONTAINEDINSPATIALSTRUCTURE") {
      const childRefs = String(args[4] || "").match(/#\d+/g) || [];
      const parentRef = String(args[5] || "").trim();
      childRefs.forEach((childRef) => {
        if (!parentByStep.has(childRef)) parentByStep.set(childRef, parentRef);
        const list = childrenByStep.get(parentRef) || [];
        list.push(childRef);
        childrenByStep.set(parentRef, list);
      });
    }
  });

  return { entities, parentByStep, childrenByStep };
}

function buildIndex(parsed, sourceFile) {
  const { entities, parentByStep, childrenByStep } = parsed;
  const nodes = {};
  const guidToNodeId = {};
  const stepToNodeId = {};

  entities.forEach((entity, stepId) => {
    if (!entity.guid && !entity.ifcClass) return;
    const nodeId = entity.guid || stepId;
    stepToNodeId[stepId] = nodeId;
    nodes[nodeId] = {
      id: nodeId,
      guid: entity.guid || "",
      stepId,
      type: nodeTypeForClass(entity.ifcClass),
      ifcClass: entity.ifcClass,
      name: entity.name || entity.ifcClass || stepId,
      parentId: null,
      childrenIds: [],
      source: "ifc-index",
    };
    if (entity.guid) guidToNodeId[entity.guid] = nodeId;
  });

  Object.keys(nodes).forEach((nodeId) => {
    const stepId = nodes[nodeId].stepId;
    const parentStep = parentByStep.get(stepId);
    if (parentStep && stepToNodeId[parentStep]) {
      nodes[nodeId].parentId = stepToNodeId[parentStep];
    }
    const childSteps = childrenByStep.get(stepId) || [];
    nodes[nodeId].childrenIds = childSteps
      .map((childStep) => stepToNodeId[childStep])
      .filter(Boolean);
  });

  const projectNode = Object.values(nodes).find((node) => node.ifcClass === "IfcProject" && !node.parentId) ||
    Object.values(nodes).find((node) => node.ifcClass === "IfcProject") ||
    Object.values(nodes).find((node) => !node.parentId) ||
    null;

  return {
    generatedAt: new Date().toISOString(),
    sourceFile: path.basename(sourceFile),
    rootId: projectNode ? projectNode.id : "",
    nodes,
    guidToNodeId,
  };
}

function verifyPath(index, guid) {
  const nodeId = index.guidToNodeId[guid];
  if (!nodeId) return [];
  const path = [];
  const seen = new Set();
  let currentId = nodeId;
  while (currentId && index.nodes[currentId] && !seen.has(currentId)) {
    seen.add(currentId);
    const node = index.nodes[currentId];
    path.push(`${node.ifcClass}:${node.name}`);
    currentId = node.parentId;
  }
  return path.reverse();
}

(function main() {
  const { input, output } = readArgs();
  const text = fs.readFileSync(input, "utf8");
  const records = extractRecords(text);
  const parsed = parseEntityRecords(records);
  const index = buildIndex(parsed, input);
  fs.writeFileSync(output, JSON.stringify(index));

  const sampleGuid = "3oF2ohaM90mumLPvHsPPyl";
  const samplePath = verifyPath(index, sampleGuid);
  console.log(`Wrote ${output}`);
  console.log(`Indexed nodes: ${Object.keys(index.nodes).length}`);
  if (samplePath.length) {
    console.log(`Sample ${sampleGuid}: ${samplePath.join(" > ")}`);
  }
})();

