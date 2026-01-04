import type { ILocationService } from "azure-devops-extension-api";
import * as SDK from "azure-devops-extension-sdk";

import { logDebug, logError, logInfo } from "../common/log";
import { HeaderLink, ObjectListWithCount, WebHeaderLink } from "../models/header-links";

class AdoService {
    private static instanceInternal: AdoService;
    private rootUrlCache: string;
    private readonly locationServiceId = "ms.vss-features.location-service";
    private readonly globalBannerKey = "GlobalMessageBanners/p2-fsteff-links-settings";

    public static get instance(): AdoService {
        return this.instanceInternal == null ? new AdoService() : this.instanceInternal;
    }

    public async getHeaderLinks(): Promise<HeaderLink[]> {
        logInfo("Loading header links.");
        const rootUrl = await this.getRootUrl();
        const accessToken = await SDK.getAccessToken();
        const url = `${rootUrl}_apis/settings/entries/host/HeaderLinks?api-version=3.2-preview`;

        logDebug("Requesting header links.", { url });
        const response = await window.fetch(url, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        ensureOk(response, "Load header links");

        const responseString = await response.text();
        const webEntity = JSON.parse(responseString) as ObjectListWithCount<WebHeaderLink>;

        const links = HeaderLink.fromWebEntity(webEntity);
        logInfo("Loaded header links.", { count: links.length });
        return links;
    }

    public async saveHeaderLink(link: HeaderLink): Promise<void> {
        const webEntity = link.toWebEntity();

        const rootUrl = await this.getRootUrl();
        const accessToken = await SDK.getAccessToken();
        const url = `${rootUrl}_apis/settings/entries/host?api-version=3.2-preview`;
        logInfo("Saving header link.", { text: link.text, url: link.url });
        const response = await window.fetch(url, {
            method: "PATCH",
            body: JSON.stringify(webEntity),
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });

        ensureOk(response, "Save header link");
        logInfo("Saved header link.", { text: link.text });
    }

    public async deleteHeaderLink(link: HeaderLink): Promise<void> {
        const entity = link.toWebEntity();
        const title = Object.keys(entity)[0];

        const rootUrl = await this.getRootUrl();
        const accessToken = await SDK.getAccessToken();
        const url = `${rootUrl}_apis/settings/entries/host/${title}?api-version=3.2-preview`;
        logInfo("Deleting header link.", { title });
        const response = await window.fetch(url, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        ensureOk(response, "Delete header link");
        logInfo("Deleted header link.", { title });
    }

    public async deleteHeaderLinks(): Promise<void> {
        const rootUrl = await this.getRootUrl();
        const accessToken = await SDK.getAccessToken();
        const url = `${rootUrl}_apis/settings/entries/host/HeaderLinks?api-version=3.2-preview`;
        logInfo("Deleting all header links.");
        const response = await window.fetch(url, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        ensureOk(response, "Delete all header links");
        logInfo("Deleted all header links.");
    }

    public async saveGlobalBanner(message: string): Promise<void> {
        const payload = {
            [this.globalBannerKey]: {
                level: "Info",
                dismissable: false,
                message,
            },
        };

        const rootUrl = await this.getRootUrl();
        const accessToken = await SDK.getAccessToken();
        const url = `${rootUrl}_apis/settings/entries/host?api-version=3.2-preview`;
        logInfo("Saving global banner.");
        const response = await window.fetch(url, {
            method: "PATCH",
            body: JSON.stringify(payload),
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });

        ensureOk(response, "Save global banner");
    }

    public async deleteGlobalBanner(key?: string): Promise<void> {
        const bannerKey = key || this.globalBannerKey;
        const rootUrl = await this.getRootUrl();
        const accessToken = await SDK.getAccessToken();
        const url = `${rootUrl}_apis/settings/entries/host/${bannerKey}?api-version=3.2-preview`;
        logInfo("Deleting global banner.", { key: bannerKey });
        const response = await window.fetch(url, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (response.status === 404) {
            logInfo("Global banner not found.", { key: bannerKey });
            return;
        }

        ensureOk(response, "Delete global banner");
    }

    private async getRootUrl(): Promise<string> {
        if (this.rootUrlCache != null) {
            logDebug("Using cached root URL.", { rootUrl: this.rootUrlCache });
            return this.rootUrlCache;
        }

        logInfo("Resolving Azure DevOps root URL.");
        const locationService = await SDK.getService<ILocationService>(this.locationServiceId);
        this.rootUrlCache = await locationService.getServiceLocation();
        logDebug("Resolved root URL.", { rootUrl: this.rootUrlCache });
        return this.rootUrlCache;
    }

    public async getProjects(): Promise<string[]> {
        logInfo("Loading projects.");
        const rootUrl = await this.getRootUrl();
        const accessToken = await SDK.getAccessToken();
        const url = `${rootUrl}_apis/projects?api-version=6.0&stateFilter=WellFormed`;
        logDebug("Requesting projects.", { url });
        const response = await window.fetch(url, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        ensureOk(response, "Load projects");

        const responseString = await response.text();
        const webEntity = JSON.parse(responseString) as ProjectListResponse;
        if (webEntity == null || webEntity.value == null) {
            logInfo("No projects returned.");
            return [];
        }

        const projects = webEntity.value.map((project) => project.name);
        logInfo("Loaded projects.", { count: projects.length });
        return projects;
    }
}

export default new AdoService();

interface ProjectListResponse {
    value: ProjectInfo[];
}

interface ProjectInfo {
    name: string;
}

export interface GlobalBannerLink {
    name: string;
    href: string;
}

function ensureOk(response: Response, operation: string) {
    if (response.status < 200 || response.status >= 400) {
        logError(`${operation} failed.`, {
            status: response.status,
            statusText: response.statusText,
        });
        throw new Error(response.statusText);
    }
}
