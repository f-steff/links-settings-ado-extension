export const OrganizationOptionAny = "__any__";
export const OrganizationOptionNone = "__none__";

export const ProjectOptionAll = "__all__";
export const ProjectOptionNone = "__none__";

const headerLinksPrefix = "HeaderLinks/";

export class HeaderLink {
    public id: string;
    public text: string;
    public url: string;
    public organization: string;
    public project: string;

    public constructor() {
        this.id = ((new Date()).getTime() % Number.MAX_SAFE_INTEGER).toString();
        this.text = "";
        this.url = "";
        this.organization = OrganizationOptionAny;
        this.project = ProjectOptionAll;
    }

    public static fromWebEntity(entity: ObjectListWithCount<WebHeaderLink>): HeaderLink[] {
        if (entity == null || entity.value == null) {
            return [];
        }

        const links: HeaderLink[] = [];
        Object.keys(entity.value).forEach((title) => {
            const link = new HeaderLink();
            const body = entity.value[title];
            link.id = title.startsWith(headerLinksPrefix) ? title.slice(headerLinksPrefix.length) : title;
            link.text = body.text || "";
            link.url = body.url || "";
            link.organization = body.organization || OrganizationOptionAny;
            link.project = body.project || ProjectOptionAll;
            links.push(link);
        });

        return links;
    }

    public toWebEntity(): {[name: string]: WebHeaderLink} {
        const ret: {[name: string]: WebHeaderLink} = {};
        const title = `${headerLinksPrefix}${this.id}`;
        ret[title] = {
            text: this.text,
            url: this.url,
            organization: this.organization,
            project: this.project,
        };
        return ret;
    }
}

export class WebHeaderLink {
    public text: string;
    public url: string;
    public organization: string;
    public project: string;
}

export class ObjectListWithCount<T> {
    public count: number;
    public value: {[name: string]: T};
}
