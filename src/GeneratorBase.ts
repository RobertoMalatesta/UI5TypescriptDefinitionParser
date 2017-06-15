import { Config } from './types';
export abstract class GeneratorBase {

    protected readonly typeSeparators = /[\.\/]/g
    protected readonly tsBaseTypes = {
        "any": "any",
        "number": "number",
        "void": "void",
        "string": "string",
        "boolean": "boolean"
    }

    constructor(protected readonly config: Config) {

    }
    protected addTabs(input: string, tabsct: number, separator?: string): string {
        const tabs = Array(tabsct + 1).join(separator || "\t");
        return tabs + input.split("\n").join("\n" + tabs);
    }

    protected styleJsDoc(text: string): string {
        // TODO: Remove xml?
        return text;
    }

    protected getType(originType: string): string {
        if (!originType) {
            return "any";
        }
        const unionTypes = originType.split("|");
        let ret: string[] = [];
        for (let type of unionTypes) {
            let isArray = false;
            if (type.match(/\[\]$/)) {
                isArray = true;
                type = type.replace(/\[\]$/, "");
            }

            if (this.config.substitutedTypes.hasOwnProperty(type)) {
                type = this.config.substitutedTypes[type];
            }

            if (this.tsBaseTypes.hasOwnProperty(type)) {
                ret.push(isArray ? this.tsBaseTypes[type] + "[]" : this.tsBaseTypes[type]);
                continue;
            }

            this.addImport(type);
            ret.push(isArray ? type.split(this.typeSeparators).pop() + "[]" : type.split(this.typeSeparators).pop());
        }
        return ret.join("|");
    }

    protected addImport(type: string) {
        if (this.onAddImport) {
            this.onAddImport(type);
        }
    }

    protected onAddImport: (type: string) => void;

    protected makeComment(description: string) {
        let ret = "/**\n";
        for (const line of description.split("\n")) {
            ret += " * " + line + "\n";
        }
        return ret + "**/";
    }
}