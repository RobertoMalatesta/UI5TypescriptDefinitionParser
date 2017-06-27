import * as events from 'events';
import { IConfig, IImport, ILogDecorator } from '../../types';
import { ISymbol } from '../../UI5DocumentationTypes';
import { GeneratorBase } from '../GeneratorBase';
import { ParsedEvent } from './ParsedEvent';
import { ParsedMethod } from './ParsedMethod';

export class ParsedClass extends GeneratorBase {
    constructor(private documentClass: ISymbol, private classTemplate: string, config: IConfig, private decorated: ILogDecorator) {
        super(config);
        this.createMissingProperties();
    }
    constructors: ParsedMethod[];
    get name(): string {
        return this.documentClass.basename;
    }

    get moduleName(): string {
        return this.documentClass.module;
    }

    baseclass?: ParsedClass;
    get extendedClass(): string {
        return this.documentClass.extends;
    }
    methods: ParsedMethod[];
    events: ParsedEvent[];
    get description(): string {
        return this.documentClass.description;
    }

    private imports: { [key: string]: IImport };

    toString(): string {
        let ct = this.classTemplate.toString();
        // 1. Set Module Name
        ct = ct.replace("classModule", this.moduleName);
        // 2. Set Class Name
        ct = ct.replace("className", this.name);

        // 3. Add Imports
        const importStrings: string[] = [];
        for (const importkey in this.imports) {
            if (importkey) {
                importStrings.push(`import { ${this.imports[importkey].name} } from "${this.imports[importkey].module}";`);
            }
        }
        ct = ct.replace("/*$$imports$$*/", importStrings.join("\n"));

        if (this.extendedClass) {
            ct = ct.replace("/*$$extends$$*/", "extends " + this.extendedClass.split(".").pop());
        } else {
            ct = ct.replace("/*$$extends$$*/", "");
        }

        // 3. Paste description
        ct = ct.replace("/*$$description$$*/", this.createDescription(this.description));

        // 4. Create Events
        if (this.events.length > 0) {
            ct = ct.replace("/*$$events$$*/", this.addTabs(this.events.map((value, index, array) => value.toString()).join("\n"), 2));
        } else {
            ct = ct.replace("/*$$events$$*/", "");
        }

        if (this.events.length > 0) {
            ct = ct.replace("/*$$methods$$*/", this.addTabs(this.methods.map((value, index, array) => value.toString()).join("\n"), 2));
        } else {
            ct = ct.replace("/*$$methods$$*/", "");
        }

        if (this.constructors.length > 0) {
            ct = ct.replace("/*$$ctors$$*/", this.addTabs(this.constructors.map((value, index, array) => value.toString()).join("\n"), 2));
        } else {
            ct = ct.replace("/*$$ctors$$*/", "");
        }

        // Create Property Interface

        ct = ct.replace("/*$$propertyInterface$$*/", this.createSettingsInterface());

        // Replace Imports
        if (this.imports[this.name]) {
            delete this.imports[this.name];
        }

        ct = ct.replace("/*$$imports$$*/", this.addTabs(this.importsToString(), 1));

        return ct;
    }

    log(message: string, sourceStack?: string): void {
        if (sourceStack) {
            this.decorated.log("Class '" + this.name + "' -> " + sourceStack, message);
        } else {
            this.decorated.log("Class '" + this.name + "'", message);
        }
    }

    private createMissingProperties(): void {
        this.imports = {};

        if (this.documentClass.extends) {
            this.addImport(this.documentClass.extends);
        }

        // 4. Create Events
        if (this.documentClass.events) {
            this.events = this.documentClass.events.map((value, index, array) => new ParsedEvent(value, this, this.config, this.addImport.bind(this), this));
        } else {
            this.events = [];
        }

        // 5. Create methods
        if (this.documentClass.methods) {
            this.documentClass.methods.forEach((value, index, array) => {
                this.methods.concat(ParsedMethod.createMethodOverloads(value, this.addImport.bind(this), this, this.config, this));
            });
        } else {
            this.methods = [];
        }

        // 6. Create Constructor
        try {
            if (this.documentClass.constructor) {
                this.documentClass.constructor.name = "constructor";
                this.documentClass.constructor.visibility = "public";
                if (this.documentClass.constructor.parameters[1].name === "mSettings") {
                    this.documentClass.constructor.parameters[1].type = "I" + this.documentClass.basename + "Settings";
                }

                this.constructors = ParsedMethod.createMethodOverloads(this.documentClass.constructor, this.addImport.bind(this), this, this.config, this, true);
            }
        } catch (error) {
            // Caught, as always a constructor is given.
            this.constructors = [];
        }
    }

    protected onAddImport = (typeOrModule: string, type?: string) => {
        if (!typeOrModule) {
            return;
        }

        if (typeOrModule === "I" + this.name + "Settings") {
            return;
        }
        const typename = typeOrModule.split(this.typeSeparators).pop();

        if (!this.imports[typename]) {
            this.imports[typename] = {
                name: typename,
                module: typeOrModule.replace(/\./g, "/"),
            };
        }
    }

    private createDescription(description: string): string {
        if (!description) {
            return "";
        }
        let ret = "/**\n";

        if (description) {
            description = this.styleJsDoc(description);
            description = this.makeComment(description);
        }

        return description;
    }

    private importsToString(): string {
        let ret = "";
        for (const i in this.imports) {
            if (this.imports.hasOwnProperty(i)) {
                ret += this.imports[i] + '\n';
            }
        }
        return ret;
    }

    private createSettingsInterface(): string {
        let ret = "export interface I" + this.name + "Settings";

        if (this.baseclass) {
            const exmeta = "I" + this.documentClass.extends.split(this.typeSeparators).pop() + "Settings";
            ret += " extends " + exmeta;
            this.addImport(this.baseclass.moduleName, exmeta);
        }

        ret += " {\n";

        let props: string[] = [];

        if (this.documentClass["ui5-metadata"]) {
            if (this.documentClass["ui5-metadata"].properties) {
                for (const prop of this.documentClass["ui5-metadata"].properties) {
                    let pstring: string = prop.name;
                    pstring += "?: ";
                    pstring += this.getType(prop.type);
                    pstring += ";";
                    props.push(pstring);
                }
            }
        }

        ret += this.addTabs(props.join("\n"), 1);

        return ret + "\n}";
    }
}