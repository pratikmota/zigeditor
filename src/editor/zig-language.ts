import { StreamLanguage } from "@codemirror/language";

const keywords = new Set([
  "align",
  "allowzero",
  "and",
  "anyframe",
  "anytype",
  "asm",
  "async",
  "await",
  "break",
  "callconv",
  "catch",
  "comptime",
  "const",
  "continue",
  "defer",
  "else",
  "enum",
  "errdefer",
  "error",
  "export",
  "extern",
  "fn",
  "for",
  "if",
  "inline",
  "linksection",
  "noalias",
  "noinline",
  "nosuspend",
  "opaque",
  "or",
  "orelse",
  "packed",
  "pub",
  "resume",
  "return",
  "struct",
  "suspend",
  "switch",
  "test",
  "threadlocal",
  "try",
  "union",
  "unreachable",
  "usingnamespace",
  "var",
  "volatile",
  "while",
]);

const types = new Set([
  "anyerror",
  "anyopaque",
  "bool",
  "c_char",
  "c_int",
  "c_long",
  "c_longdouble",
  "c_longlong",
  "c_short",
  "c_uint",
  "c_ulong",
  "c_ulonglong",
  "c_ushort",
  "f128",
  "f16",
  "f32",
  "f64",
  "f80",
  "i128",
  "i16",
  "i32",
  "i64",
  "i8",
  "isize",
  "noreturn",
  "type",
  "u128",
  "u16",
  "u32",
  "u64",
  "u8",
  "usize",
  "void",
]);

const atoms = new Set(["false", "null", "true", "undefined"]);

export const zigLanguage = StreamLanguage.define({
  name: "zig",
  startState: () => ({}),
  token(stream) {
    if (stream.eatSpace()) {
      return null;
    }

    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }

    if (stream.match("\\\\")) {
      stream.skipToEnd();
      return "string";
    }

    if (stream.match('"')) {
      while (!stream.eol()) {
        if (stream.match("\\")) {
          stream.next();
          continue;
        }
        if (stream.match('"')) {
          break;
        }
        stream.next();
      }
      return "string";
    }

    if (stream.match("'")) {
      while (!stream.eol()) {
        if (stream.match("\\")) {
          stream.next();
          continue;
        }
        if (stream.match("'")) {
          break;
        }
        stream.next();
      }
      return "string";
    }

    if (
      stream.match(/0x[0-9a-fA-F_]+/) ||
      stream.match(/0b[01_]+/) ||
      stream.match(/0o[0-7_]+/) ||
      stream.match(/\d[\d_]*(?:\.[\d_]+)?/)
    ) {
      return "number";
    }

    if (stream.match(/[A-Za-z_]\w*/)) {
      const word = stream.current();
      if (keywords.has(word)) {
        return "keyword";
      }
      if (types.has(word)) {
        return "typeName";
      }
      if (atoms.has(word)) {
        return "atom";
      }
      return "variableName";
    }

    if (stream.match(/[{}()[\];,.]/) || stream.match(/[=+\-*/%<>!&|^~?:]/)) {
      return "operator";
    }

    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "//" },
  },
});
