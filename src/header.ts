import * as SDK from "azure-devops-extension-sdk";
import type {
    IGlobalMessagesService,
    IHostNavigationService,
    IProjectPageService,
} from "azure-devops-extension-api/Common/CommonServices";

import { logDebug, logError, logInfo, logWarn } from "./common/log";
import {
    HeaderLink,
    OrganizationOptionAny,
    OrganizationOptionNone,
    ProjectOptionAll,
    ProjectOptionNone,
} from "./models/header-links";
import AdoService from "./services/ado-service";

let cachedLinks: HeaderLink[] = [];
let lastPathname = "";
let lastBannerKey = "";
let bannerService: IGlobalMessagesService | null = null;
let navigationService: IHostNavigationService | null = null;
let started = false;
let placeholderShown = false;
const globalMessagesServiceId = "ms.vss-tfs-web.tfs-global-messages-service";
const hostNavigationServiceId = "ms.vss-features.host-navigation-service";
const projectPageServiceId = "ms.vss-tfs-web.tfs-page-data-service";
const bannerCacheStorageKey = "links-ext.banner-cache.v1";

SDK.register("DynamicBannerService", () => ({
    showBanner: async () => {
        await startBanner();
    },
}));

SDK.init();
logInfo("Dynamic banner service registered.");
void startBanner();

async function loadLinks(): Promise<void> {
    try {
        logInfo("Loading header links for banner.");
        cachedLinks = await AdoService.getHeaderLinks();
        logInfo("Header links loaded.", { count: cachedLinks.length });
    } catch (ex) {
        logError("Failed to load header links.", ex);
        cachedLinks = [];
    }
}

async function startWatcher(): Promise<void> {
    lastPathname = await getRouteKey();
    logDebug("Starting banner watcher.", { path: lastPathname });
    window.setInterval(async () => {
        const pathname = await getRouteKey();
        if (pathname !== lastPathname) {
            lastPathname = pathname;
            logDebug("Pathname changed, re-rendering banner.", { path: pathname });
            await renderBanner();
        }
    }, 1000);
}

async function renderBanner(): Promise<void> {
    const context = await getLocationContext();
    const routeKey = await getRouteKey();
    logDebug("Rendering banner.", context);
    const filteredLinks = cachedLinks
        .filter((link) => isLinkVisible(link, context.organization, context.project))
        .filter((link) => Boolean(link.text && link.url))
        .sort((first, second) => (first.text || "").localeCompare(second.text || ""));

    console.info(
        `[links-ext] banner links: total=${cachedLinks.length}, shown=${filteredLinks.length}`
    );

    const key = JSON.stringify(filteredLinks.map((link) => `${link.text}|${link.url}`));
    if (filteredLinks.length === 0) {
        if (lastBannerKey) {
            logInfo("No links for this page, closing banner.");
            const service = await getBannerService();
            service.closeBanner();
            lastBannerKey = "";
            setCachedBanner(routeKey, null);
        }
        return;
    }

    if (key === lastBannerKey) {
        return;
    }

    const messageLinks = filteredLinks.map((link) => ({
        name: link.text,
        href: link.url,
    }));
    const messageFormat = `Links: ${messageLinks.map((_, index) => `{${index}}`).join(" | ")}`;

    const service = await getBannerService();
    service.closeBanner();
    service.addBanner({
        level: 0,
        dismissable: false,
        messageFormat,
        messageLinks,
    });

    lastBannerKey = key;
    setCachedBanner(routeKey, { key, messageFormat, messageLinks });
    logInfo("Banner rendered.", { count: messageLinks.length });
}

async function getBannerService(): Promise<IGlobalMessagesService> {
    if (!bannerService) {
        bannerService = await SDK.getService<IGlobalMessagesService>(globalMessagesServiceId);
    }
    return bannerService;
}

async function getLocationContext(): Promise<{ organization: string; project: string }> {
    const host = SDK.getHost();
    const organization = host && host.name ? host.name : "";
    let project = "";
    try {
        const projectService = await SDK.getService<IProjectPageService>(projectPageServiceId);
        const projectInfo = await projectService.getProject();
        project = projectInfo && projectInfo.name ? projectInfo.name : "";
    } catch (error) {
        logDebug("Project context not available.", { error: getErrorMessage(error) });
    }

    return { organization, project };
}

function isLinkVisible(link: HeaderLink, organization: string, project: string): boolean {
    if (link.organization === OrganizationOptionNone) {
        return false;
    }

    if (link.organization !== OrganizationOptionAny && normalize(link.organization) !== normalize(organization)) {
        return false;
    }

    if (project) {
        if (link.project === ProjectOptionNone) {
            return false;
        }

        if (link.project === ProjectOptionAll) {
            return true;
        }

        return normalize(link.project) === normalize(project);
    }

    return link.project === ProjectOptionNone || link.project === ProjectOptionAll;
}

function normalize(value: string): string {
    return (value || "").toLocaleLowerCase();
}

async function getRouteKey(): Promise<string> {
    try {
        if (!navigationService) {
            navigationService = await SDK.getService<IHostNavigationService>(hostNavigationServiceId);
        }
        const route = await navigationService.getPageRoute();
        const values = route && route.routeValues ? JSON.stringify(route.routeValues) : "";
        return `${route ? route.id : ""}|${values}`;
    } catch (error) {
        logDebug("Route lookup failed.", { error: getErrorMessage(error) });
        return window.location.pathname;
    }
}

async function startBanner(): Promise<void> {
    if (started) {
        return;
    }
    started = true;
    logWarn("Header Links dynamic banner starting.");
    try {
        await SDK.ready();
        const routeKey = await getRouteKey();
        const cachedBanner = getCachedBanner(routeKey);
        if (cachedBanner) {
            logInfo("Using cached banner.", { count: cachedBanner.messageLinks.length });
            const service = await getBannerService();
            service.addBanner({
                level: 0,
                dismissable: false,
                messageFormat: cachedBanner.messageFormat,
                messageLinks: cachedBanner.messageLinks,
            });
            lastBannerKey = cachedBanner.key;
            placeholderShown = true;
        } else {
            await showPlaceholderBanner();
        }
        await loadLinks();
        await renderBanner();
        await startWatcher();
        SDK.notifyLoadSucceeded();
    } catch (error) {
        logError("Dynamic banner initialization failed.", error);
        SDK.notifyLoadFailed(error instanceof Error ? error.message : "Dynamic banner initialization failed.");
    }
}

async function showPlaceholderBanner(): Promise<void> {
    if (placeholderShown) {
        return;
    }
    placeholderShown = true;
    lastBannerKey = "__placeholder__";
    const service = await getBannerService();
    service.addBanner({
        level: 0,
        dismissable: false,
        message: "Links:",
    });
}

function getCachedBanner(routeKey: string): BannerCacheEntry | null {
    try {
        const raw = window.localStorage.getItem(bannerCacheStorageKey);
        if (!raw) {
            return null;
        }
        const cache = JSON.parse(raw) as Record<string, BannerCacheEntry>;
        const entry = cache[routeKey];
        if (!entry || !entry.messageLinks || entry.messageLinks.length === 0) {
            return null;
        }
        return entry;
    } catch (error) {
        logDebug("Failed to read banner cache.", { error: getErrorMessage(error) });
        return null;
    }
}

function setCachedBanner(routeKey: string, entry: BannerCacheEntry | null): void {
    try {
        const raw = window.localStorage.getItem(bannerCacheStorageKey);
        const cache = raw ? (JSON.parse(raw) as Record<string, BannerCacheEntry>) : {};
        if (entry) {
            cache[routeKey] = entry;
        } else {
            delete cache[routeKey];
        }
        window.localStorage.setItem(bannerCacheStorageKey, JSON.stringify(cache));
    } catch (error) {
        logDebug("Failed to update banner cache.", { error: getErrorMessage(error) });
    }
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

interface BannerCacheEntry {
    key: string;
    messageFormat: string;
    messageLinks: Array<{ name: string; href: string }>;
}
