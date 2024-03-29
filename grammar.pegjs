command = (token:command_token _ { return token })+
command_token = literal / optional / required
literal = word:word words:("/" word)* { return {type: "string_literal", values: [word, ...words.map(n => n[1])]} }
word = letters:[A-Za-z0-9_]+ { return letters.join("") }
optional = "[" param:param "]" { return {optional: true, ...param} }
required = "<" param:param ">" { return {optional: false, ...param} }
param = name:word ":" _ ptype:ptype { return {type: "param", name, ptype} }
ptype = ptype_word / ptype_or
ptype_word = word:word { return {type: "typename", value: word} }
ptype_or = strings:(_ "\"" word:word "\"" _ "|"? _ { return word })+ { return {type: "string_or", values: strings} }
_ = " "*