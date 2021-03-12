# Specification

Every command grammar is made up of multiple types of components, seperated by spaces.

## Literals

Literals are plain strings inside the grammar that must always be directly matched and will not affect the output of the command parser. They are case insensitive. Literals can also be seperated by `/` to produce aliases, which are similar to string parameters but will not be included in the output parse result, and will generate a different syntax in `generateCommandString`.

### Example

In this example, `sayhello` is a string literal. It must always be directly matched for a command to match this grammar.

```
sayhello <name: string>
```

## Params

Params are inputs within a command string that can accept data. Params take the form of `param_name: param_type`, and can be surrounded by either `<` and `>` for required params, or `[` and `]` for optional params

### Example

In this example, `<name: string>` is a param. It will match anything that the `string` type can match.

```
sayhello <name: string>
```

## Types

There are two possible ways to specify types in command grammars. You can have standard type names (e.g. `name: string`), or specific allowed strings (e.g. `mode: "on" | "off"`). Specific allowed strings are case insensitive. The meaning and final parsing behavior of each specific type name is up to the implementor of this specification.
