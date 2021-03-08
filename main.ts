const pegjs = require('./grammar.js');
export class ParserStream<T> {
  characters: T[];
  cnt: number;
  public constructor(input: T[]) {
    this.characters = input;
    this.cnt = 0;
  }
  public get atEnd(): boolean {
    return !this.characters.length;
  }
  public get count(): number {
    return this.cnt;
  }
  public peek(n?: number): T | undefined {
    if (this.characters.length <= (n || 0)) return undefined;
    return this.characters[n || 0];
  }
  public consume(n?: number): T | undefined {
    if (this.characters.length <= (n || 0)) return undefined;
    const tmp = this.peek(n);
    this.characters.splice(n || 0, 1);
    this.cnt++;
    return tmp;
  }
  public nextn(n: number): T[] {
    return this.characters.slice(0, n);
  }
  public clone(): ParserStream<T> {
    const tmp = new ParserStream([...this.characters]);
    tmp.cnt = this.count;
    return tmp;
  }
  public consumen(n: number): T[] {
    const tmp = this.nextn(n);
    for (let i = 0; i < n; i++) this.consume();
    return tmp;
  }
}

export interface StringLiteral {
  type: 'string_literal';
  value: string;
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
      strings.push(param.value);
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
    if (
      command.atEnd &&
      ast.slice(i).find((n) => n.type == 'string_literal' || !n.optional)
    )
      throw new ParseError(ast.length, 'Unexpected end of command');
    else if (command.atEnd) break;

    if (i != 0 && command.consume() != ' ')
      throw new ParseError(i, 'Expected " "');
    if (param.type == 'string_literal') {
      const nn = command.consumen(param.value.length).join('');
      if (nn != param.value)
        throw new ParseError(i, `Expected ${param.value}, found ${nn}`);
    } else if (param.type == 'param') {
      if (param.ptype.type == 'string_or') {
        const matched_string = param.ptype.values.find(
          (v) => command.nextn(v.length).join('') == v
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
      } else if (param.ptype.value in types) {
        try {
          const output = await types[param.ptype.value](
            command.clone(),
            typeMeta
          );
          command = output.stream;
          params[param.name] = output.result;
        } catch (e) {
          if (!param.optional) throw e;
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
      `Expected characters at end of command, found ${command.characters.join(
        ''
      )}`
    );
  return params;
}
/*
interface TypeMeta {
  channels: { name: string; id: string }[];
}

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
  channel: (command: ParserStream<string>, meta: TypeMeta) => {
    let buffer = '';
    while (command.peek() != ' ' && !command.atEnd) {
      buffer += command.consume();
    }
    if (parseInt(buffer)) return { stream: command, result: buffer };
    else if (/<#\d+>/.test(buffer))
      return {
        stream: command,
        result: buffer.match(/<#(?<id>\d+)>/)?.groups?.id,
      };
    else if (meta.channels.find((n) => n.name == buffer))
      return {
        stream: command,
        result: meta.channels.find((n) => n.name == buffer),
      };
    else throw new ParseError(command.count, 'Expected channel');
  },
};


console.dir(output, {
  depth: null,
});
console.log('!' + generateCommandString(output));
console.log(
  matchCommand(output, 'tmprole remove 2345453', types, {
    channels: [
      { name: 'general', id: '432323234324234' },
      { name: 'main', id: '0899898898989' },
    ],
  })
);
*/
