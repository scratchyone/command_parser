import {
  parseCommandGrammar,
  matchCommand,
  ParserStream,
  ParseError,
  generateCommandMatcherFunction,
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
  'reminder/rm add [emote: "uwu" | "owo"] <duration: word> <text: string>';

const ast = parseCommandGrammar(commandString);
const commandMatcherFunction = generateCommandMatcherFunction(ast, types);

test('grammar parses correctly', () => {
  expect(parseCommandGrammar(commandString)).toStrictEqual([
    { type: 'string_literal', values: ['reminder', 'rm'] },
    { type: 'string_literal', values: ['add'] },
    {
      optional: true,
      type: 'param',
      name: 'emote',
      ptype: { type: 'string_or', values: ['uwu', 'owo'] },
    },
    {
      optional: false,
      type: 'param',
      name: 'duration',
      ptype: { type: 'typename', value: 'word' },
    },
    {
      optional: false,
      type: 'param',
      name: 'text',
      ptype: { type: 'typename', value: 'string' },
    },
  ]);
});
test('command parses correctly', async () => {
  expect(
    await matchCommand(ast, 'rm add owo 10s howdy there friend', types, null)
  ).toStrictEqual({
    duration: '10s',
    emote: 'owo',
    text: 'howdy there friend',
  });
});
test('command parses correctly with optionals missing', async () => {
  expect(
    await matchCommand(ast, 'rm add 10s howdy there friend', types, null)
  ).toStrictEqual({
    duration: '10s',
    text: 'howdy there friend',
  });
});
test('command handles errors properly', async () => {
  await expect(
    matchCommand(ast, 'rm addowo howdy there friend', types, null)
  ).rejects.toThrow('Expected " ", found o');
});
test('command errors give correct tokenLevel', async () => {
  let error: ParseError | undefined;
  try {
    await matchCommand(ast, 'rm addowo howdy there friend', types, null);
  } catch (e) {
    error = e;
  }
  expect(error as ParseError).toHaveProperty('tokenLevel', 2);
});
test('generated command parses correctly', async () => {
  expect(
    await commandMatcherFunction('rm add owo 10s howdy there friend', null)
  ).toStrictEqual({
    duration: '10s',
    emote: 'owo',
    text: 'howdy there friend',
  });
});
test('generated command parses correctly with optionals missing', async () => {
  expect(
    await commandMatcherFunction('rm add 10s howdy there friend', null)
  ).toStrictEqual({
    duration: '10s',
    text: 'howdy there friend',
  });
});
test('generated command handles errors properly', async () => {
  await expect(
    commandMatcherFunction('rm addowo howdy there friend', null)
  ).rejects.toThrow('Expected " ", found o');
});
test('generated command errors give correct tokenLevel', async () => {
  let error: ParseError | undefined;
  try {
    await commandMatcherFunction('rm addowo howdy there friend', null);
  } catch (e) {
    error = e;
  }
  expect(error as ParseError).toHaveProperty('tokenLevel', 2);
});
