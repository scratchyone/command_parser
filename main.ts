const pegjs = require('./grammar.js');
import jsStringEscape from 'js-string-escape';

export class ParserStream<T> {
  public characters: T[];
  public count: number;
  public constructor(input: T[]) {
    this.characters = input;
    this.count = 0;
  }
  public get atEnd(): boolean {
    return !this.characters.length;
  }
  public peek(n?: number): T | undefined {
    if (this.characters.length <= (n || 0)) return undefined;
    return this.characters[n || 0];
  }
  public consume(n?: number): T | undefined {
    if (this.characters.length <= (n || 0)) return undefined;
    return this.characters.splice(n || 0, 1)[0];
  }
  public nextn(n: number): T[] {
    return this.characters.slice(0, n);
  }
  public clone(): ParserStream<T> {
    const tmp = new ParserStream(this.characters.slice(0));
    tmp.count = this.count;
    return tmp;
  }
  public consumen(n: number): T[] {
    return this.characters.splice(0, n);
  }
}

export interface StringLiteral {
  type: 'string_literal';
  values: string[];
}
export interface Param {
  type: 'param';
  name: string;
  ptype: PType;
  optional: boolean;
}
export type PType =
  | {
      type: 'typename';
      value: string;
    }
  | {
      type: 'string_or';
      values: string[];
    };
export type ParsedCommandDef = Array<StringLiteral | Param>;

export function parseCommandGrammar(grammar: string): ParsedCommandDef {
  return pegjs.parse(grammar);
}
export function generateCommandString(def: ParsedCommandDef): string {
  const strings = [];
  for (const param of def) {
    if (param.type == 'string_literal') {
      strings.push(param.values.join('/'));
    } else if (param.type == 'param') {
      let str = '';
      if (param.optional) str += '[';
      else str += '<';
      if (param.ptype.type == 'typename') str += param.name.toUpperCase();
      else if (param.ptype.type == 'string_or')
        str += param.ptype.values.join('/');
      if (param.optional) str += ']';
      else str += '>';
      strings.push(str);
    } else {
      throw 'Unknown param type detected while trying to generate command string';
    }
  }
  return strings.join(' ');
}

export class ParseError extends Error {
  tokenLevel: number;
  constructor(tokenLevel: number, ...params: any[]) {
    // Pass remaining arguments (including vendor specific ones) to parent constructor
    super(...params);

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ParseError);
    }
    this.tokenLevel = tokenLevel;
    this.name = 'ParseError';
  }
}

export function generateCommandMatcherFunction<T>(
  ast: ParsedCommandDef,
  types: {
    [key: string]: (
      // eslint-disable-next-line no-unused-vars
      arg0: ParserStream<string>,
      // eslint-disable-next-line no-unused-vars
      arg1: T
    ) =>
      | Promise<{ stream: ParserStream<string>; result: any }>
      | { stream: ParserStream<string>; result: any };
  }
): (cmd: string, typeMeta: T) => Promise<{ [key: string]: any }> {
  const f = `async (cmd, typeMeta) => {\n  let command = new ParserStream(cmd.split(''));\n  const params = {};\n${[
    ...ast.entries(),
  ]
    .map(([i, param]) => {
      let buffer = '';
      if (ast.slice(i).find((n) => n.type == 'string_literal' || !n.optional))
        buffer += `  if(command.atEnd)\n    throw new ParseError(${i}, 'Unexpected end of command');\n`;
      else buffer += '  if(command.atEnd)\n    return params;\n';
      if (param.type == 'string_literal') {
        let first = true;
        for (const value of [...param.values].sort(
          (a, b) => b.length - a.length
        )) {
          if (first) buffer += '  ';
          else buffer += '  else ';
          buffer += `if(command.nextn(${
            value.length + (i == 0 ? 0 : 1)
          }).join('').toLowerCase() == '${jsStringEscape(
            (i == 0 ? '' : ' ') + value.toLowerCase()
          )}')\n`;
          buffer += `    command.consumen(${
            value.length + (i == 0 ? 0 : 1)
          });\n`;
          first = false;
        }
        if (i != 0) {
          buffer += "  else if(command.peek() != ' ')\n";
          buffer += `    throw new ParseError(${i}, 'Expected " ", found ' + command.peek());\n`;
        }
        buffer += `  else\n    throw new ParseError(${i}, 'Expected${
          param.values.length == 1 ? ' ' : ' either '
        }${param.values.join(' or ')}, found ' + command.nextn(${
          param.values.reduce((a, b) => (a.length > b.length ? a : b), '')
            .length + (i == 0 ? 0 : 1)
        }).join('')${i == 0 ? '' : '.substring(1)'});\n`;
      } else if (param.type == 'param') {
        if (param.ptype.type == 'string_or') {
          let first = true;
          for (const value of [...param.ptype.values].sort(
            (a, b) => b.length - a.length
          )) {
            if (first) buffer += '  ';
            else buffer += '  else ';
            buffer += `if(command.nextn(${
              value.length + (i == 0 ? 0 : 1)
            }).join('').toLowerCase() == '${jsStringEscape(
              (i == 0 ? '' : ' ') + value.toLowerCase()
            )}') {\n`;
            buffer += `    params['${jsStringEscape(
              param.name
            )}'] = '${jsStringEscape(value)}';\n    command.consumen(${
              value.length + (i == 0 ? 0 : 1)
            });\n  }\n`;
            first = false;
          }
          if (i != 0) {
            buffer += "  else if(command.peek() != ' ')\n";
            buffer += `    throw new ParseError(${i}, 'Expected " ", found ' + command.peek());\n`;
          }
          if (!param.optional)
            buffer += `  else\n    throw new ParseError(${i}, 'Expected${
              param.ptype.values.length == 1 ? ' ' : ' either '
            }${param.ptype.values.join(' or ')}, found ' + command.nextn(${
              param.ptype.values.reduce(
                (a, b) => (a.length > b.length ? a : b),
                ''
              ).length + (i == 0 ? 0 : 1)
            }).join('')${i == 0 ? '' : '.substring(1)'});\n`;
        } else if (param.ptype.value in types) {
          if (param.optional) buffer += '  try {\n';
          else buffer += '  {\n';
          buffer += "    if(command.peek() != ' ')\n";
          buffer += `      throw new ParseError(${i}, 'Expected " ", found ' + command.peek());\n`;
          buffer += '    const newCommand = command.clone();\n';
          buffer += `    newCommand.count = ${i};\n`;
          buffer += '    newCommand.consume();\n';
          buffer += `    const res = await (${types[
            param.ptype.value
          ].toString()})(newCommand, typeMeta);\n`;
          buffer += `    command = res.stream;\n    params['${jsStringEscape(
            param.name
          )}'] = res.result;\n`;
          if (param.optional) buffer += '  } catch(e) {}\n';
          else buffer += '  }\n';
        } else {
          throw new Error(
            'Internal error, unexpected param ptype found in AST'
          );
        }
      } else {
        throw new Error('Internal error, unexpected param type found in AST');
      }
      return buffer;
    })
    .join('')}\n  if(!command.atEnd)\n    throw new ParseError(${
    ast.length
  }, 'Expected end of command, found ' + command.characters.join());\n  return params;\n}`;
  return eval(f);
}

export async function matchCommand<T>(
  ast: ParsedCommandDef,
  cmd: string,
  types: {
    [key: string]: (
      // eslint-disable-next-line no-unused-vars
      arg0: ParserStream<string>,
      // eslint-disable-next-line no-unused-vars
      arg1: T
    ) =>
      | Promise<{ stream: ParserStream<string>; result: any }>
      | { stream: ParserStream<string>; result: any };
  },
  typeMeta: T
): Promise<{ [key: string]: any }> {
  let command = new ParserStream(cmd.split(''));
  const params: { [key: string]: any } = {};
  for (const [i, param] of ast.entries()) {
    const backup = command.clone();
    if (
      command.atEnd &&
      ast.slice(i).find((n) => n.type == 'string_literal' || !n.optional)
    )
      throw new ParseError(i, 'Unexpected end of command');
    else if (command.atEnd) break;

    const currChar = command.peek();

    if (i != 0 && currChar != ' ')
      throw new ParseError(i, 'Expected " ", found ' + currChar);
    else if (i != 0) command.consume();
    if (param.type == 'string_literal') {
      const matched_string = param.values.find(
        (v) => command.nextn(v.length).join('').toLowerCase() == v.toLowerCase()
      );
      if (matched_string) command.consumen(matched_string.length);
      else
        throw new ParseError(
          i,
          `Expected one of ${param.values.join(' or ')}, found ${command
            .nextn(5)
            .join('')}`
        );
    } else if (param.type == 'param') {
      if (param.ptype.type == 'string_or') {
        const matched_string = param.ptype.values.find(
          (v) =>
            command.nextn(v.length).join('').toLowerCase() == v.toLowerCase()
        );
        if (matched_string) {
          params[param.name] = matched_string;
          command.consumen(matched_string.length);
        } else if (!param.optional)
          throw new ParseError(
            i,
            `Expected one of ${param.ptype.values.join(
              ' or '
            )}, found ${command.nextn(5).join('')}`
          );
        else if (param.optional) command = backup;
      } else if (param.ptype.value in types) {
        try {
          const newCommand = command.clone();
          newCommand.count = i;
          const output = await types[param.ptype.value](newCommand, typeMeta);
          command = output.stream;
          params[param.name] = output.result;
        } catch (e) {
          if (!param.optional) throw e;
          else if (param.optional) command = backup;
        }
      } else {
        throw new Error(
          'Internal parser error, unexpected param ptype found in AST'
        );
      }
    } else
      throw new Error(
        'Internal parser error, unexpected param type found in AST'
      );
  }
  if (!command.atEnd)
    throw new ParseError(
      ast.length,
      `Expected end of command, found ${command.characters.join('')}`
    );
  return params;
}

/*
const types = {
  string: (command: ParserStream<string>) => {
    let buffer = '';
    while (!command.atEnd) {
      buffer += command.consume();
    }
    if (buffer.length == 0)
      throw new ParseError(
        command.count,
        'Expected string, found end of command'
      );
    return { stream: command, result: buffer };
  },
};
(async () => {
  const output = parseCommandGrammar(
    'reminder/rm <action: "add" | "remove"> <text: string>'
  );

  console.dir(output, {
    depth: null,
  });
  console.log('!' + generateCommandString(output));
  console.log(
    await matchCommand(output, 'rm add 2345453', types, {
      channels: [
        { name: 'general', id: '432323234324234' },
        { name: 'main', id: '0899898898989' },
      ],
    })
  );
})();
*/
