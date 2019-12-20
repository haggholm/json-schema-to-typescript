export const input = {
  "title": "Enum",
  "type": "object",
  "properties": {
    "stringEnum": {
      "type": "string",
      "enum": ["a", "b", "c"],
      "tsEnumNames": ['A', 'B', 'C']
    },
    "stringEnumItem": {
      "type": "string",
      "enum": ["a"],
      "tsEnumRef": { "$ref": "#/properties/stringEnum" }
    }
  },
  required: ['stringEnum', 'stringEnumItem'],
  additionalProperties: false
}
