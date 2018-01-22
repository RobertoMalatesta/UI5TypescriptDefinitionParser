import * as events from "events";
import { IConfig, IImport, ILogDecorator } from "../../types";
import { ISymbol, IParameter, IProperty } from '../../UI5DocumentationTypes';
import { GeneratorBase } from "../GeneratorBase";
import { ParsedEvent } from "./ParsedEvent";
import { ParsedMethod } from './ParsedMethod';
import * as Handlebars from "handlebars";
import * as hbex from "../../handlebarsExtensions";
import { ParsedParameter } from './ParsedParameter';

interface IClass {
  constructors: ParsedMethod[];
  childClasses: ParsedClass[];
  methods: ParsedMethod[];
  events: ParsedEvent[];
  parsedDescription: string;
}

export class ParsedClass extends GeneratorBase implements IClass {
  constructor(
    private documentClass: ISymbol,
    private classTemplate: string,
    config: IConfig,
    private decorated: ILogDecorator
  ) {
    super(config);
    this.createMissingProperties();
  }
  constructors: ParsedMethod[];
  get name(): string {
    return this.documentClass.basename;
  }

  get moduleName(): string {
    let moduleparts = this.documentClass.module.split(this.typeSeparators);
    return this.documentClass.module
      .split(this.typeSeparators)
      .splice(0, moduleparts.length - 1)
      .join("/");
  }

  get fullName(): string {
    return this.documentClass.module;
  }

  public childClasses: ParsedClass[] = [];

  private _baseclass: ParsedClass;
  get baseclass(): ParsedClass {
    return this._baseclass;
  }
  set baseclass(value: ParsedClass) {
    value.childClasses.push(this);
    this._baseclass = value;
  }
  get extendedClass(): string {
    return this.documentClass.extends;
  }
  methods: ParsedMethod[] = [];
  events: ParsedEvent[];
  get description(): string {
    return this.documentClass.description;
  }

  public get Imports(): IImport[] {
    const impa = [];
    for (const importkey in this.imports) {
      if (importkey) {
        impa.push(this.imports[importkey]);
      }
      return impa;
    }
  }
  private imports: { [key: string]: IImport };

  toString(): string {
    const template = Handlebars.compile(this.classTemplate, {
      noEscape: true
    });
    this.parsedDescription = this.createDescription(this.description);
    return template(this);
    // this.log("Creating class string");
    // let ct = this.classTemplate.toString();
    // // 1. Set Module Name
    // ct = ct.replace("classModule", this.moduleName);
    // // 2. Set Class Name
    // ct = ct.replace("className", this.name);
    // // 3. Add Imports
    // const importStrings: string[] = [];
    // for (const importkey in this.imports) {
    //     if (importkey) {
    //         importStrings.push(`import { ${this.imports[importkey].name} } from "${this.imports[importkey].module}";`);


    //     }
    // }
    // ct = ct.replace("/*$$imports$$*/", importStrings.join("\n"));
    // if (this.extendedClass) {
    //     ct = ct.replace("/*$$extends$$*/", "extends " + this.extendedClass.split(".").pop());
    // } else {
    //     ct = ct.replace("/*$$extends$$*/", "");
    // }
    // // 3. Paste description
    // ct = ct.replace("/*$$description$$*/", this.createDescription(this.description));
    // // 4. Create Events
    // if (this.events.length > 0) {
    //     ct = ct.replace("/*$$events$$*/", this.addTabs(this.events.map((value, index, array) => value.toString()).join("\n"), 2));
    // } else {
    //     ct = ct.replace("/*$$events$$*/", "");
    // }
    // if (this.methods.length > 0) {
    //     ct = ct.replace("/*$$methods$$*/", this.addTabs(this.methods.map((value, index, array) => value.toString()).join("\n"), 2));
    // } else {
    //     ct = ct.replace("/*$$methods$$*/", "");
    // }
    // if (this.constructors.length > 0) {
    //     ct = ct.replace("/*$$ctors$$*/", this.addTabs(this.constructors.map((value, index, array) => value.toString()).join("\n"), 2));
    // } else {
    //     ct = ct.replace("/*$$ctors$$*/", "");
    // }
    // // Create Property Interface
    // ct = ct.replace("/*$$propertyInterface$$*/", this.createSettingsInterface());
    // // Replace Imports
    // if (this.imports[this.name]) {
    //     delete this.imports[this.name];
    // }
    // ct = ct.replace("/*$$imports$$*/", this.addTabs(this.importsToString(), 1));
    // return ct;
  }

  log(message: string, sourceStack?: string): void {
    if (sourceStack) {
      this.decorated.log(
        "Class '" + this.name + "' -> " + sourceStack,
        message
      );
    } else {
      this.decorated.log("Class '" + this.name + "'", message);
    }
  }

  private createMissingProperties(): void {
    this.log("Creating properties, events and methods");
    this.imports = {};

    if (this.documentClass.extends) {
      this.addImport(this.documentClass.extends);
    }

    // 4. Create Events
    if (this.documentClass.events) {
      this.events = this.documentClass.events.map(
        (value, index, array) =>
          new ParsedEvent(
            value,
            this,
            this.config,
            this.onAddImport.bind(this),
            this
          )
      );
    } else {
      this.events = [];
    }

    // 5. Create methods
    if (this.documentClass.methods) {
      this.documentClass.methods.forEach((value, index, array) => {
        this.methods = this.methods.concat(
          ParsedMethod.createMethodOverloads(
            value,
            this.onAddImport.bind(this),
            this,
            this.config,
            this
          )
        );
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
          this.documentClass.constructor.parameters[1].type =
            "I" + this.documentClass.basename + "Settings";
        }

        this.constructors = ParsedMethod.createMethodOverloads(
          this.documentClass.constructor,
          this.onAddImport.bind(this),
          this,
          this.config,
          this,
          true
        );
      }
    } catch (error) {
      // Caught, as always a constructor is given.
      this.constructors = [];
    }

    // 7. Create Extension interface
    try {
      this.log("Creating settings interface");

      let props: IProperty[] = [];

      if (this.documentClass["ui5-metadata"]) {
        if (this.documentClass["ui5-metadata"].properties) {
          for (const prop of this.documentClass["ui5-metadata"].properties) {
            prop.type = this.getType(prop.type);
            props.push(prop);
          }
          this.settingsInterfaceProperties = props;
        }
      }
    } catch (error) {
      this.settingsInterfaceProperties = [];
    }
  }

  private settingsInterfaceProperties: IProperty[] = [];

  protected onAddImport = (typeOrModule: string, type?: string) => {
    if (!typeOrModule) {
      return;
    }

    this.log("Adding import '" + typeOrModule + "'");

    if (typeOrModule === "I" + this.name + "Settings") {
      return;
    }

    const modulename = typeOrModule.split(this.typeSeparators);
    const typename = modulename.pop();

    if (!this.imports[typename]) {
      this.imports[typename] = {
        name: typename,
        module: modulename.join("/")
      };
    }
  };

  private createDescription(description: string): string {
    this.log("Creating description");
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

  parsedDescription: string;

  public pushOverloads(): void {
    this.log("Pushing Overloads");
    for (const c of this.childClasses) {
      c.createOverloads();
      c.pushOverloads();
    }
  }

  public createOverloads(): void {
    this.log("Creating overloads");
    for (const basemethod of this.baseclass.methods) {
      if (
        this.methods.some(
          (value, index, array) => value.IsOverload(basemethod))
      ) {
        this.methods.push(basemethod);
      }
    }
    this.methods = this.methods.sort((a, b) => a.name.localeCompare(b.name));
  }
}
