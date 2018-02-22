# UI5TypescriptDefinitionParser

Parses Typescript from the UI5 documentation

## Usage

### Install

1. Go to console and run `npm install` (make sure node.js is installed and referenced in PATH <- Windows only)
1. Install gulp (`npm install gulp -g`)

### Use

Create a nodejs server application and import the module Parser:

```typescript
import { Parser } from "./Parser";

let p = new Parser("./config.json");
return p.GenerateDeclarations();
```

## Settings

All settings are configured in the config.json file, which path can be given to the parser.

### 1. Fetching API.json

The parser will first try to get locally cached files. If it does not find any it will try and get them from the hana.ondemand source.

```json
"connection": {
    "root": "https://openui5.hana.ondemand.com/test-resources",
    "endpoints": [
      "sap/m/designtime/api.json",
      "sap/ui/core/designtime/api.json",
      "sap/tnt/designtime/api.json",
      "sap/ui/commons/designtime/api.json",
      "sap/ui/demokit/designtime/api.json",
      "sap/ui/dt/designtime/api.json",
      "sap/ui/layout/designtime/api.json",
      "sap/ui/suite/designtime/api.json",
      "sap/ui/table/designtime/api.json",
      "sap/ui/unified/designtime/api.json",
      "sap/ui/ux3/designtime/api.json",
      "sap/uxap/designtime/api.json"
    ]
  },
```

You can find these files after the first run in the `apis` folder generated by the parser. You can prevent caching by setting it to false:

```json
"cacheApis": true,
```

### 2. Preprocessing

The preprocessing will modify the loaded api.json objects (no files are modified) using the [jsonpath package](https://www.npmjs.com/package/jsonpath). Thus, it uses json path to get the desired parameters specified by `jsonpath`. In the subscript filter javascript can be used (for example regex).

After that it will apply the function given in `script`. The scriptfunction always gets a val variable, which has to be manipulated and **returned**. The logger will output the caught object in debug level or set a breakpoint in the debugwrapper in the parser.ts, if you are running it with a debugger.

In addition a comment can be provided to describe what is happening in the log output.

This example will set all methods except extend and getMetadata for all modules starting with `sap/m/` to not static:

```json
"preProcessing": {
    "correctStaticSapM": {
        "comment": "Replaces incorrect static values in sap/m",
        "script": "if(val.name) val.static = false;",
        "jsonpath":
        "$.symbols[?(@.kind == 'class' && @.module.startsWith('sap/m/'))].methods[?(@.static == true && @.name.match(/^(?!extend|getMetadata).*$/))]"
    }, ...
}
```

### 3. Parsing

The parsing process goes through the loaded api docs, takes all exported symbols and combines them to valid typings. Via config you have multiple ways to adjust the process.

#### 3.1 Types and parameter name replacements / fixes

To fix some bugs in parameter names (for example usage of html tags or other not-allowed figures for variable and parameter names) the `cleanParamNames` section can be used:

```json
"cleanParamNames": {
    "<code>vData</code>": "vData",
    "&lt;your-page-object-name&gt;": "[key: string]"
  },
```

The property name is the parameter to replace and gets replaced by the value (which has to be a string). Example:

```typescript
class a {
    public testMethod(<code>vData</code>: string): void;
}
```

The method above would not be compilable for the parser. Using the replacement, the `<code>vData</code>` will be replaced with the proper `"vData"` name:

```typescript
class a {
  public testMethod(vData: string): void;
}
```

This will be applied to all function/method parameters in all classes, namespaces, etc.

#### 3.2 Type Map

The type map is the same as the `cleanParameterNames`. It will replace wrong types, in all classes, namespaces, enums, etc. The key will be the type to replace, the value will be the replacement

```json
"typeMap": {
    "*": "any",
    "any[]": "any[]",
    "array": "any[]",
```

Example:

```typescript
class a {
    public testMethod(data: *): void;
}
```

will be replaced by

```typescript
class a {
    public testMethod(data: any): void;
}
```

#### 3.3 Parsing enums

Enums will be parsed using the template `enums.d.ts.hb`. The template uses [Handlebars](https://handlebarsjs.com/) syntax and the raw symbol:

```typescript
interface ISymbol {
    // enum
  kind: string;
  // sap.m.BackgroundDesign
  name: string;
  // BackgroundDesign
  basename: string;
  // sap/m/library.js
  resource: string;
  // sap/m/library or sap.m.library if not modular
  module: string;
  // BackgroundDesign
  export: string;
  // true
  static: boolean;
  // public, private, recstricted or protected
  visibility: string;
  // Description text
  description: string;
  // The properties the enum uses
  properties: IProperty[];
}

interface IProperty {
    // Solid
  name: string;
  // public, private, restricted or protected
  visibility: string;
  // true or false 
  static: boolean;
  // any type, basetype or other sap.ui.... type
  type: string;
  // any description
  description: string;
}
```

The files will all be put out in the out folder and enums subfolder. All enums will be declared ambient.

#### 3.4 Parsing namespaces

Uses `ParsedNamespace` class and `namespace.d.ts.hb` template. All namespaces are ambient (thus, always available).

#### 3.5 Parsing interfaces

Uses `ParsedClass` class and `interface.d.ts.hb` template. All interfaces are ambient (thus, always available).

#### 3.6 Parsing classes

Uses `ParsedClass` class and either `classAmbient.d.ts.hb` template, if the class is ambient (`module` of Symbol in the api json is separated with dots `.` instead of slashes `/`), otherwise it uses `classModule.d.ts.hb`.

##### a) Establishing Inheritance

After getting all classes (that means the ParsedClass objects are instanciated), the parser will start with base classes that have no base class and work its way up until the inheritance hierarchy is established.

##### b) Creating Overloads

After the class inheritance is done, the parser will start to get all overloaded methods and try to adjust them so they can be overloaded. Furthermore leading optional parameters are resolved as overloads. Tailing optional method parameters are left with `?`.

### 4. Postprocessing

Postprocessing will be going through all output files and replace whole text sections either using strings or regular expressions. The key will be the path to the file starting from the output folder. The value is an array with all replacements that should be done in the file.

Example for a string:

```json
"namespaces/sap.ui.core.BusyIndicator": [
      {
        "searchString": "declare namespace {} {",
        "replacement": "declare namespace sap.ui.core.BusyIndicator {"
      }
    ],
```

Example for a regex:

```json
"classes/sap/ui/model/Model": [
      {
        "searchString": "(\\W)Model([^\\w\\/\\.'`<])",
        "replacement": "$1Model<T>$2",
        "isRegex": true,
        "regexFlags": "g"
      }
]
```

to replace with a regex `isRegex` has to be set to true and optionally a flag can be set (as the global flag above).

Also globs can be used:

```json
"namespaces/**/*": [
      {
        "searchString":
          "sap\\.ui\\.core\\.(?:Control|Element|BusyIndicator|Component|mvc\\.Controller|mvc\\.View|mvc\\.Fragment|Fragment|Core|mvc\\.HTMLView|mvc\\.JSONView|mvc\\.JSView|tmpl\\.Template|mvc\\.TemplateView|mvc\\.XMLView)([^\\w])",
        "replacement": "{}$1",
        "isRegex": true,
        "regexFlags": "g"
      },
]
```

### 5. Custom Handlebars extensions

To put in some custom handlebars extensions just modify the file `handlebarsExtensions.ts`