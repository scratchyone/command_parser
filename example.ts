import {
  generateCommandString,
  matchCommand,
  parseCommandGrammar,
  ParseError,
  ParserStream,
} from './main';

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
  word: (command: ParserStream<string>) => {
    let buffer = '';
    while (!command.atEnd && command.peek() != ' ') {
      buffer += command.consume();
    }
    if (buffer.length == 0)
      throw new ParseError(
        command.count,
        'Expected word, found end of command'
      );
    return { stream: command, result: buffer };
  },
};

const commandString =
  'reminder/rm add [emote: "uwu" | "owo"] <duration: word> [text: string]';

const ast = parseCommandGrammar(commandString);
console.log(generateCommandString(ast));
(async () => {
  console.log(await matchCommand(ast, 'rm add uwu 10s', types, null));
})();
