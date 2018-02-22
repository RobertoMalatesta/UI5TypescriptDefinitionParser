declare namespace {{toNamespace this.name}} {
    {{#if this.methods.length~}}
    // Methods
    {{#each this.methods~}}
    /**
    {{documentThis this.description}}
    */
    export function {{this.name}}(
        {{~#if this.parameters.length~}}
            {{~#each this.parameters~}}
                {{#unless @first}} {{/unless}}{{this.name}}: {{this.type}}{{#unless @last}}, {{/unless}}
            {{~/each~}}
        {{~/if~}}
    ){{#if this.returntype}}: {{this.returntype.type}}{{/if}};
    
    {{~/each}}
    {{/if}}
    {{#if this.fields.length~}}
    {{#each this.fields}}
    // Fields
    /**
    {{documentThis this.description}}
    */
    export const {{this.name}}: {{this.type}};
    {{/each}}
    {{/if}}
}