import { IConfig, ILogDecorator } from "../../types";
import {
  IMethod,
  IParameter,
  IReturnValue,
  Visibility
} from "../../UI5DocumentationTypes";
import { GeneratorBase } from "../GeneratorBase";
import { ParsedClass } from "./ParsedClass";
import { ParsedNamespace } from "./ParsedNamespace";
import { ParsedParameter } from "./ParsedParameter";
import * as _ from "lodash";
import { ParsedEvent } from "./ParsedEvent";

export class ParsedMethod extends GeneratorBase {
  overloadedMethod: ParsedMethod;
  parameters: ParsedParameter[] = [];
  stubs: string[];

  get name(): string {
    return this.wrappedMethod.name;
  }

  get description(): string {
    return this.wrappedMethod.description;
  }

  get isStatic(): boolean {
    return this.wrappedMethod.static;
  }

  visibility: Visibility;

  returntype: IReturnValue;

  constructor(
    private wrappedMethod: IMethod,
    onAddImport: (type: string, context?: string) => string,
    private decorated: ILogDecorator,
    config: IConfig,
    private owner: ParsedClass | ParsedNamespace,
    private suppressReturnValue?: boolean,
    forcteStatic?: boolean
  ) {
    super(config);
    if(forcteStatic)
      this.wrappedMethod.static = true;
    this.onAddImport = onAddImport;
    this.generateMethodParts(suppressReturnValue);
  }

  get parsedDescription(): string {
    return this.createDescription(
      this.description,
      this.parameters,
      this.returntype
    );
  }
  private createDescription(
    description: string,
    parameters?: ParsedParameter[],
    returnValue?: IReturnValue
  ): string {
    let ret = "";
    if (description) {
      ret = this.styleJsDoc(description) + "\n";
    }

    if (returnValue) {
      ret += `@return {${this.getType(
        returnValue.type,
        this.isStatic ? "static" : undefined
      )}} ${returnValue.description}\n`;
    }

    if (parameters) {
      for (const param of parameters) {
        ret += `@param {${this.getType(param.type, "static")}} ${
          param.optional ? "[" : ""
        }${param.name}${param.optional ? "]" : ""} ${param.description}\n`;
      }
    }

    return this.makeComment(ret);
  }

  public static overloadLeadingOptionalParameters(
    method: IMethod,
    onAddImport: (type: string) => string,
    decorated: ILogDecorator,
    config: IConfig,
    owner: ParsedClass | ParsedNamespace,
    suppressReturnValue?: boolean,
    context?: "static"
  ): ParsedMethod[] {
    if (method.parameters && method.parameters.length > 1) {
      let overloads: ParsedMethod[] = [];
      let optionalMap = method.parameters.map(value => value.optional || false);
      let firstOptionalIndex: number;
      let lastMandatoryIndex: number;
      do {
        // Get first optional and last mandatory parameter
        firstOptionalIndex = optionalMap.indexOf(true);
        lastMandatoryIndex = optionalMap.lastIndexOf(false);
        if (
          lastMandatoryIndex !== -1 &&
          firstOptionalIndex !== -1 &&
          firstOptionalIndex < lastMandatoryIndex
        ) {
          // set all parameters left from first mandatory to mandatory
          for (let i = 0; i < lastMandatoryIndex; i++) {
            method.parameters[i].optional = false;
          }
          // remove optional parameter and create method stub
          let save = method.parameters.splice(firstOptionalIndex, 1).pop();
          overloads.push(
            new ParsedMethod(
              method,
              onAddImport,
              decorated,
              config,
              owner,
              suppressReturnValue,
              context ? true : false
            )
          );
          method.parameters.splice(firstOptionalIndex, 0, save);

          // Reset method parameters array
          for (let i = 0; i < optionalMap.length; i++) {
            method.parameters[i].optional = optionalMap[i];
          }

          // Set removed parameter to mandatory
          method.parameters[firstOptionalIndex].optional = false;
          // Reevaluate optional map
          optionalMap = method.parameters.map(value => value.optional || false);
        } else {
          overloads.push(
            new ParsedMethod(
              method,
              onAddImport,
              decorated,
              config,
              owner,
              suppressReturnValue
            )
          );
        }
      } while (
        lastMandatoryIndex !== -1 &&
        firstOptionalIndex !== -1 &&
        firstOptionalIndex < lastMandatoryIndex
      );
      return overloads;
    } else {
      return [new ParsedMethod(method, onAddImport, decorated, config, owner)];
    }
  }

  public IsGeneric: boolean = false;

  public GenericParameters: string[] = [];

  private generateMethodParts(suppressReturnValue?: boolean): void {
    // If method name starts with attach it is an event
    if (this.owner instanceof ParsedClass && this.name.startsWith("attach")) {
      const eventname = /attach(.*)/.exec(this.name)[1].toLocaleLowerCase();
      const event = (this.owner as ParsedClass).events.find(
        x => x.name.toLowerCase() === eventname
      );
      if (event) this.makeAttachEventParameters(event);
      else this.makeStandardMethodParameters(suppressReturnValue);
    } else {
      this.makeStandardMethodParameters(suppressReturnValue);
    }
  }

  private makeStandardMethodParameters(suppressReturnValue?: boolean): void {
    suppressReturnValue = suppressReturnValue || false;
    if ((this.wrappedMethod.visibility as any) === "restricted") {
      this.visibility = "private";
    } else {
      this.visibility = this.wrappedMethod.visibility;
    }
    if (this.wrappedMethod.parameters) {
      this.parameters = this.wrappedMethod.parameters.map(
        (value, index, array) =>
          new ParsedParameter(
            value,
            (this.owner as ParsedClass).basename,
            this.onAddImport,
            this.config,
            this,
            this.isStatic ? "static" : undefined
          )
      );
    }
    if (suppressReturnValue) {
    } else this.createReturnType();
  }

  private createReturnType() {
    if (this.wrappedMethod.returnValue) {
      let restypes: {
        restype: string;
        origintype: string;
      }[] = [];
      let rtype = this.getType(
        this.wrappedMethod.returnValue.type,
        this.isStatic ? "static" : undefined,
        restypes
      );
      this.returntype = {
        type: rtype,
        rawTypes: {},
        description: this.wrappedMethod.returnValue.description,
        unknown: false
      };
      for (const t of restypes) {
        this.returntype.rawTypes[t.restype] = t.origintype;
      }
    } else {
      this.returntype = {
        type: "any",
        description: "",
        unknown: true,
        rawTypes: {}
      };
    }
  }

  private makeAttachEventParameters(event: ParsedEvent): void {
    // Check which parameters got used
    let objParam = this.wrappedMethod.parameters.find(x => x.name === "oData");
    let func = this.wrappedMethod.parameters.find(x => x.name === "fnFunction");
    let context = this.wrappedMethod.parameters.find(
      x => x.name === "oListener"
    );

    //add custom event payload parameter
    if (objParam) {
      const coparam = new ParsedParameter(
        objParam,
        this.owner.basename,
        undefined,
        this.config,
        this,
        "static"
      );
      this.parameters.push(coparam);

      this.IsGeneric = true;
      objParam.type = "TcustomData";
      this.GenericParameters.push(objParam.type);
    }

    // add event function callback parameter
    if (func) {
      const cfunc = new ParsedParameter(
        func,
        this.owner.basename,
        undefined,
        this.config,
        this,
        "static"
      );
      this.parameters.push(cfunc);
      this.returntype = {
        type: "this",
        description: "",
        rawTypes: {}
      };

      try {
        cfunc.type =
          "(" +
          (context ? "this: Tcontext, " : "this: this") +
          "oEvent: " +
          event.callback +
          (objParam !== undefined
            ? ", oCustomData?: TcustomData) => void"
            : ") => void");
        func.typeAlreadyProcessed = true;
      } catch (error) {
        let i = 0;
      }
    }

    // Add context parameter
    if (context) {
      const cparam = new ParsedParameter(
        context,
        this.owner.basename,
        undefined,
        this.config,
        this,
        this.isStatic ? "static" : undefined
      );

      this.parameters.push(cparam);

      if (func) {
        cparam.type = "Tcontext";
        this.IsGeneric = true;
        this.GenericParameters.push(cparam.type);
      }
    }

    if (!this.returntype) {
      this.createReturnType();
    }
  }

  toString(suppressDescription?: boolean): string {
    suppressDescription = suppressDescription || false;
    this.suppressReturnValue = this.suppressReturnValue || false;
    let ret: string = "";

    if (this.description && !suppressDescription) {
      ret +=
        this.createDescription(
          this.description,
          this.parameters,
          this.returntype
        ) + "\n";
    }

    ret += this.visibility !== "public" ? this.visibility + " " : "";
    ret += this.isStatic ? "static " : "";
    ret += this.name + "(";
    ret += this.parameters
      .map<string>((value, index, array) => value.toString())
      .join(", ");

    ret += ")";
    if (!this.suppressReturnValue) {
      ret +=
        ": " +
        this.getType(
          this.returntype.type,
          this.isStatic ? "static" : undefined
        );
    }
    ret += ";";
    return ret;
  }

  private getParameterDescription(
    description: string,
    defaultvalue: any
  ): string {
    return (
      "/*" +
      description
        .split("\n")
        .map((value, index, array) => " * " + value)
        .join("\n") +
      (defaultvalue ? "\n * @default " + defaultvalue.toString() + "\n" : "") +
      " */\n"
    );
  }

  log(message: string, sourceStack?: string) {
    if (sourceStack) {
      this.decorated.log(
        "Function '" + this.name + "' -> " + sourceStack,
        message
      );
    } else {
      this.decorated.log("Function '" + this.name + "'", message);
    }
  }

  public IsOverload(method: ParsedMethod) {
    if (this.name !== method.name) return false;

    if (this.parameters.length === method.parameters.length) {
      for (let i = 0; i < this.parameters.length; i++) {
        const thisParam = this.parameters[i];
        if (thisParam.type !== method.parameters[i].type) {
          return true;
        }
      }
    }

    if (method.returntype.type === "this") {
      this.returntype.type = "this";
      return false;
    }

    // Check if this method contains all types of basetype.
    const thisret = this.returntype.type.split("|");
    const baseret = method.returntype.type.split("|");

    for (const type of baseret) {
      const found = thisret.indexOf(type);
      if (found > -1) {
        thisret.splice(found, 1);
      }
    }
    if (thisret.length > 0) return true;

    return false;
  }

  /**
   * This method overloads the current method (this) with the base method. Check if the methods are overloads with IsOverload first.
   *
   * @param {ParsedMethod} basemethod The base method to overload
   * @returns {ParsedMethod} The (modified?) base method
   * @memberof ParsedMethod
   */
  overload(basemethod: ParsedMethod): ParsedMethod {
    this.visibility = basemethod.visibility;
    this.importBaseMethodParameters(basemethod.parameters);
    // this.wrappedMethod.description +=
    //   "\n\n_Overloads " +
    //   basemethod.name +
    //   " of class " +
    //   basemethod.owner.basename +
    //   "_";
    return this.mergeBaseType(basemethod);
  }

  private importBaseMethodParameters(parameters: ParsedParameter[]) {
    for (const param of parameters) {
      this.getType(param.raw.type, "static");
    }
  }
  private mergeBaseType(basemethod: ParsedMethod) {
    this.overloadedMethod = basemethod;
    // merge basetypes
    let basetypes = basemethod.returntype.type.split("|").map(x => x.trim());
    let thistypes = this.returntype.type.split("|").map(x => x.trim());
    thistypes = _.uniq(thistypes.concat(basetypes));
    if (thistypes.indexOf("this") > -1) {
      this.returntype.type = "this";
    } else {
      this.returntype.type = thistypes
        .map(x => {
          const tshort = this.getType(
            basemethod.returntype.rawTypes[x] || x,
            this.isStatic ? "static" : undefined
          );
          if (basemethod.returntype.rawTypes[x])
            this.returntype.rawTypes[x] = basemethod.returntype.rawTypes[x];
          return x;
        })
        .join(" | ");
    }
    return basemethod;
  }
}
