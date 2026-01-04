import * as SDK from "azure-devops-extension-sdk";

import { logDebug, logError, logInfo, logWarn } from "./common/log";
import AdoService from "./services/ado-service";
import {
  HeaderLink,
  OrganizationOptionAny,
  OrganizationOptionNone,
  ProjectOptionAll,
  ProjectOptionNone
} from "./models/header-links";

type EditableHeaderLink = HeaderLink & { __dirty?: boolean };
type HeaderLinkSnapshot = {
  text: string;
  url: string;
  organization: string;
  project: string;
};
type EditableHeaderLinkWithOriginal = EditableHeaderLink & { __original?: HeaderLinkSnapshot };
const OrganizationOptionOrgOnly = "__org_only__";

interface AppState {
  links: EditableHeaderLinkWithOriginal[];
  organizationName: string;
  projects: string[];
  errorText: string | null;
}

const state: AppState = {
  links: [],
  organizationName: "",
  projects: [],
  errorText: null
};

SDK.init();
logInfo("Hub initializing.");
SDK.ready().then(async () => {
  logInfo("Hub SDK ready.");
  await loadData();
  render();
  SDK.notifyLoadSucceeded();
}).catch((error) => {
  logError("Hub initialization failed.", error);
  state.errorText = `There was an error initializing the extension: ${getErrorMessage(error)}`;
  render();
  SDK.notifyLoadFailed(getErrorMessage(error));
});

async function loadData() {
  try {
    const host = SDK.getHost();
    state.organizationName = host && host.name ? host.name : "";
    logDebug("Detected organization context.", { organization: state.organizationName });
    const [links, projects] = await Promise.all([
      AdoService.getHeaderLinks(),
      AdoService.getProjects()
    ]);
    state.links = links as EditableHeaderLinkWithOriginal[];
    state.links.forEach((link) => setOriginal(link));
    state.projects = projects;
    state.errorText = null;
    logInfo("Hub data loaded.", { links: links.length, projects: projects.length });
    await syncGlobalBanner();
  } catch (error) {
    logError("Failed to load hub data.", error);
    state.errorText = `There was an error loading the links: ${getErrorMessage(error)}`;
  }
}

function render() {
  const root = document.getElementById("root");
  if (!root) {
    logWarn("Hub root element not found.");
    return;
  }

  logDebug("Rendering hub.", {
    links: state.links.length,
    projects: state.projects.length,
    error: Boolean(state.errorText)
  });
  root.innerHTML = "";

  const container = document.createElement("div");
  container.className = "page";

  const header = document.createElement("div");
  header.className = "page-header";

  const title = document.createElement("h1");
  title.textContent = "Header Link Settings";
  header.appendChild(title);

  const actions = document.createElement("div");
  actions.className = "page-actions";

  const addButton = document.createElement("button");
  addButton.className = "primary";
  addButton.textContent = "Add link";
  addButton.addEventListener("click", () => {
    logInfo("Adding new link.");
    const link = new HeaderLink() as EditableHeaderLinkWithOriginal;
    link.__original = undefined;
    link.__dirty = true;
    state.links.push(link);
    render();
  });
  actions.appendChild(addButton);

  const deleteAllButton = document.createElement("button");
  deleteAllButton.textContent = "Delete all";
  deleteAllButton.addEventListener("click", () => confirmDeleteAll());
  actions.appendChild(deleteAllButton);

  header.appendChild(actions);
  container.appendChild(header);

  if (state.errorText) {
    const error = document.createElement("div");
    error.className = "error";
    error.textContent = state.errorText;
    container.appendChild(error);
  }

  const list = document.createElement("div");
  list.className = "link-list";
  container.appendChild(list);

  const table = document.createElement("table");
  table.className = "link-table";
  table.appendChild(buildColumnGroup());

  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.appendChild(buildHeaderCell("Link text"));
  headRow.appendChild(buildHeaderCell("URL"));
  headRow.appendChild(buildHeaderCell("Organization"));
  headRow.appendChild(buildHeaderCell("Project"));
  headRow.appendChild(buildHeaderCell("Actions"));
  headRow.appendChild(buildHeaderCell("Status"));
  head.appendChild(headRow);
  table.appendChild(head);

  const body = document.createElement("tbody");
  table.appendChild(body);
  list.appendChild(table);

  const sortedLinks = state.links
    .slice()
    .sort((a, b) => (a.text || "").localeCompare(b.text || ""));

  if (sortedLinks.length === 0) {
    const emptyRow = document.createElement("tr");
    const emptyCell = document.createElement("td");
    emptyCell.className = "empty";
    emptyCell.colSpan = 6;
    emptyCell.textContent = "No links yet.";
    emptyRow.appendChild(emptyCell);
    body.appendChild(emptyRow);
  } else {
    sortedLinks.forEach((link) => {
      body.appendChild(renderLinkRow(link));
    });
  }

  const footer = document.createElement("div");
  footer.className = "footer-note";
  footer.textContent = "Note: Not compatible with Microsoft Banner Extension.";
  container.appendChild(footer);

  root.appendChild(container);
}

function renderLinkRow(link: EditableHeaderLinkWithOriginal) {
  const row = document.createElement("tr");
  row.className = "link-row";

  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.placeholder = "Link text";
  textInput.value = link.text || "";
  textInput.addEventListener("input", (event) => {
    link.text = (event.target as HTMLInputElement).value;
    markDirty(link);
    updateCardUI();
  });
  row.appendChild(wrapCell(textInput));

  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.placeholder = "URL";
  urlInput.value = link.url || "";
  urlInput.addEventListener("input", (event) => {
    link.url = (event.target as HTMLInputElement).value;
    markDirty(link);
    updateCardUI();
  });
  row.appendChild(wrapCell(urlInput));

  const orgSelect = document.createElement("select");
  buildOrganizationOptions().forEach((option) => {
    orgSelect.appendChild(option);
  });
  orgSelect.value = getOrganizationSelectValue(link);
  orgSelect.addEventListener("change", (event) => {
    const nextOrg = (event.target as HTMLSelectElement).value;
    if (nextOrg === OrganizationOptionOrgOnly) {
      link.organization = state.organizationName || OrganizationOptionAny;
      link.project = ProjectOptionNone;
    } else {
      link.organization = nextOrg;
      link.project = getDefaultProjectForOrganization(nextOrg, link.project);
    }
    markDirty(link);
    render();
  });
  row.appendChild(wrapCell(orgSelect));

  const projectSelect = document.createElement("select");
  const projectOptions = buildProjectOptions(link);
  projectOptions.forEach((option) => {
    projectSelect.appendChild(option);
  });
  projectSelect.value = link.project || ProjectOptionAll;
  projectSelect.disabled = link.organization === OrganizationOptionNone || isOrgOnlyLink(link);
  projectSelect.addEventListener("change", (event) => {
    link.project = (event.target as HTMLSelectElement).value;
    markDirty(link);
    updateCardUI();
  });
  row.appendChild(wrapCell(projectSelect));

  const actions = document.createElement("div");
  actions.className = "row-actions";

  const saveButton = document.createElement("button");
  saveButton.className = "primary";
  saveButton.textContent = "Save";
  saveButton.disabled = !canSave(link);
  saveButton.addEventListener("click", () => saveLink(link));
  actions.appendChild(saveButton);

  const deleteButton = document.createElement("button");
  deleteButton.textContent = getDeleteLabel(link);
  deleteButton.addEventListener("click", () => {
    if (isDirty(link)) {
      discardChanges(link);
    } else {
      deleteLink(link);
    }
  });
  actions.appendChild(deleteButton);

  row.appendChild(wrapCell(actions));

  const rowMessage = document.createElement("span");
  rowMessage.className = "row-message";
  rowMessage.textContent = getRowMessage(link);
  rowMessage.classList.toggle("error", !isValid(link));
  row.appendChild(wrapCell(rowMessage));

  const updateCardUI = () => {
    saveButton.disabled = !canSave(link);
    deleteButton.textContent = getDeleteLabel(link);
    rowMessage.textContent = getRowMessage(link);
    rowMessage.classList.toggle("error", !isValid(link));
  };

  return row;
}

function buildOrganizationOptions() {
  const options = [
    { value: OrganizationOptionAny, label: "Any organization" },
    { value: OrganizationOptionNone, label: "None (disabled)" }
  ];

  if (state.organizationName) {
    options.push({ value: OrganizationOptionOrgOnly, label: "Only org" });
    options.push({ value: state.organizationName, label: state.organizationName });
  }

  return options.map((option) => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    return element;
  });
}

function buildProjectOptions(link: EditableHeaderLink) {
  const options = [
    { value: ProjectOptionAll, label: "All projects" }
  ];

  if (link.organization === state.organizationName) {
    state.projects.forEach((project) => {
      options.push({ value: project, label: project });
    });
  }

  return options.map((option) => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    return element;
  });
}

function getDefaultProjectForOrganization(organization: string, currentProject?: string) {
  if (organization === OrganizationOptionOrgOnly) {
    return ProjectOptionNone;
  }

  if (organization === OrganizationOptionNone) {
    return ProjectOptionNone;
  }

  if (organization === state.organizationName) {
    return currentProject || ProjectOptionAll;
  }

  return ProjectOptionAll;
}

function canSave(link: EditableHeaderLinkWithOriginal) {
  return isDirty(link) && isValid(link);
}

function isValid(link: EditableHeaderLinkWithOriginal) {
  return Boolean(link.text && link.text.trim() && link.url && link.url.trim());
}

function getRowMessage(link: EditableHeaderLinkWithOriginal) {
  if (!isValid(link)) {
    if (!link.text || !link.text.trim()) {
      return "Link text is required.";
    }
    return "URL is required.";
  }

  return isDirty(link) ? "Unsaved changes." : "Saved.";
}

function markDirty(link: EditableHeaderLinkWithOriginal) {
  if (!link.__original) {
    link.__dirty = true;
    return;
  }

  link.__dirty = !isSameAsOriginal(link);
}

function isDirty(link: EditableHeaderLinkWithOriginal) {
  return link.__dirty === true;
}

function getDeleteLabel(link: EditableHeaderLinkWithOriginal) {
  return isDirty(link) ? "Discard" : "Delete";
}

function discardChanges(link: EditableHeaderLinkWithOriginal) {
  if (!link.__original) {
    state.links = state.links.filter((item) => item !== link);
    render();
    return;
  }

  link.text = link.__original.text;
  link.url = link.__original.url;
  link.organization = link.__original.organization;
  link.project = link.__original.project;
  link.__dirty = false;
  render();
}

async function saveLink(link: EditableHeaderLinkWithOriginal) {
  try {
    logInfo("Saving link.", {
      text: link.text,
      url: link.url,
      organization: link.organization,
      project: link.project
    });
    await AdoService.saveHeaderLink(link);
    setOriginal(link);
    await syncGlobalBanner();
    render();
  } catch (error) {
    logError("Failed to save link.", error);
    state.errorText = "Unable to save link.";
    render();
  }
}

async function deleteLink(link: EditableHeaderLinkWithOriginal) {
  try {
    logInfo("Deleting link.", { text: link.text });
    await AdoService.deleteHeaderLink(link);
    state.links = state.links.filter((item) => item !== link);
    await syncGlobalBanner();
    render();
  } catch (error) {
    logError("Failed to delete link.", error);
    state.errorText = "Unable to delete link.";
    render();
  }
}

async function confirmDeleteAll() {
  const confirmed = window.confirm("Are you sure you want to delete all links?");
  if (!confirmed) {
    logInfo("Delete all cancelled.");
    return;
  }

  try {
    logInfo("Deleting all links.");
    await AdoService.deleteHeaderLinks();
    state.links = [];
    await syncGlobalBanner();
    render();
  } catch (error) {
    logError("Failed to delete all links.", error);
    state.errorText = "Unable to delete all links.";
    render();
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function getOrganizationSelectValue(link: EditableHeaderLinkWithOriginal) {
  if (isOrgOnlyLink(link)) {
    return OrganizationOptionOrgOnly;
  }
  return link.organization || OrganizationOptionAny;
}

function isOrgOnlyLink(link: EditableHeaderLinkWithOriginal) {
  if (!state.organizationName) {
    return false;
  }
  return link.organization === state.organizationName && link.project === ProjectOptionNone;
}

function setOriginal(link: EditableHeaderLinkWithOriginal) {
  link.__original = {
    text: link.text || "",
    url: link.url || "",
    organization: link.organization || OrganizationOptionAny,
    project: link.project || ProjectOptionAll
  };
  link.__dirty = false;
}

function isSameAsOriginal(link: EditableHeaderLinkWithOriginal) {
  if (!link.__original) {
    return false;
  }

  return (
    link.text === link.__original.text &&
    link.url === link.__original.url &&
    link.organization === link.__original.organization &&
    link.project === link.__original.project
  );
}

function buildHeaderCell(text: string) {
  const cell = document.createElement("th");
  cell.className = "link-list-title";
  cell.textContent = text;
  return cell;
}

function wrapCell(content: HTMLElement) {
  const cell = document.createElement("td");
  cell.appendChild(content);
  return cell;
}

function buildColumnGroup() {
  const colgroup = document.createElement("colgroup");
  for (let index = 0; index < 6; index += 1) {
    colgroup.appendChild(document.createElement("col"));
  }
  return colgroup;
}

async function syncGlobalBanner() {
  try {
    await AdoService.deleteGlobalBanner();
  } catch (error) {
    logDebug("Global banner cleanup skipped.", { error: getErrorMessage(error) });
  }
}



