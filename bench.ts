import {
  parseCommandGrammar,
  generateCommandString,
  matchCommand,
  ParserStream,
  ParseError,
} from './main';

import Benchmark from 'benchmark';

const suite = new Benchmark.Suite();

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
  'reminder/rm add <emote: "uwu" | "owo"> <duration: word> <text: string>';

const ast = parseCommandGrammar(commandString);

suite
  .add('parseCommandGrammar', function () {
    parseCommandGrammar(commandString);
  })
  .add('generateCommandString', function () {
    generateCommandString(ast);
  })
  .add('matchCommandFromAst', function () {
    matchCommand(ast, 'rm add owo 10s howdy', types, null);
  })
  .on('cycle', function (event: any) {
    console.log(String(event.target));
  })
  // eslint-disable-next-line no-unused-vars
  .on('complete', function (this: any) {
    console.log('Finished suite');
  })
  .run({ async: true });

/*
  suite
  .add('parseCommandGrammar', function () {
    parseCommandGrammar('reminder/rm add <duration: duration> <text: string>');
  })
  .on('cycle', function (event: any) {
    console.log(String(event.target));
  })
  .on('complete', function (this: any) {
    console.log('Fastest is ' + this.filter('fastest').map('name'));
  })
  // run async
  .run({ async: true });
*/
