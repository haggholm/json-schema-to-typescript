import {JSONSchema4, JSONSchema4TypeName, JSONSchema6} from 'json-schema'

export type SCHEMA_TYPE =
  | 'ALL_OF'
  | 'UNNAMED_SCHEMA'
  | 'ANY'
  | 'ANY_OF'
  | 'BOOLEAN'
  | 'NAMED_ENUM'
  | 'NAMED_SCHEMA'
  | 'NULL'
  | 'NUMBER'
  | 'STRING'
  | 'OBJECT'
  | 'ONE_OF'
  | 'TYPED_ARRAY'
  | 'REFERENCE'
  | 'UNION'
  | 'UNNAMED_ENUM'
  | 'UNTYPED_ARRAY'
  | 'CUSTOM_TYPE'
  | 'NEVER'

export type JSONSchemaTypeName = JSONSchema4TypeName

export type JSONSchemaDefinition = boolean | JSONSchema
type IncompatibleKeys =
  | 'exclusiveMinimum'
  | 'exclusiveMaximum'
  | 'additionalItems'
  | 'items'
  | 'required'
  | 'additionalProperties'
  | 'patternProperties'
  | 'definitions'
  | 'dependencies'
  | 'properties'
  | 'allOf'
  | 'anyOf'
  | 'oneOf'
  | 'not'
type ReplaceSchemaTypeDeep<T> = T extends {[key: string]: infer U}
  ? {[key: string]: ReplaceSchemaTypeArr<U>}
  : ReplaceSchemaTypeArr<T>
type ReplaceSchemaTypeArr<T> = [
  ReplaceSchemaType<Extract<T, any[]>[number]>[],
  ReplaceSchemaType<Exclude<T, any[]>>
][T extends any[] ? 0 : 1]
type ReplaceSchemaType<T> = T extends JSONSchema4 | JSONSchema6 ? JSONSchema : T
export interface JSONSchema extends Omit<JSONSchema4, IncompatibleKeys>, Omit<JSONSchema6, IncompatibleKeys> {
  additionalItems?: ReplaceSchemaType<JSONSchema4['additionalItems'] | JSONSchema6['additionalItems']>
  additionalProperties?: ReplaceSchemaType<JSONSchema4['additionalProperties'] | JSONSchema6['additionalProperties']>
  patternProperties?: ReplaceSchemaTypeDeep<JSONSchema4['patternProperties'] | JSONSchema6['patternProperties']>
  properties?: ReplaceSchemaTypeDeep<JSONSchema4['properties'] | JSONSchema6['properties']>
  items?: ReplaceSchemaTypeArr<JSONSchema4['items'] | JSONSchema6['items']>
  allOf?: ReplaceSchemaTypeArr<JSONSchema4['allOf'] | JSONSchema6['allOf']>
  anyOf?: ReplaceSchemaTypeArr<JSONSchema4['anyOf'] | JSONSchema6['anyOf']>
  oneOf?: ReplaceSchemaTypeArr<JSONSchema4['oneOf'] | JSONSchema6['oneOf']>
  required?: JSONSchema4['required'] | JSONSchema6['required']
  definitions?: ReplaceSchemaTypeDeep<JSONSchema4['definitions'] | JSONSchema6['definitions']>
  dependencies?: ReplaceSchemaTypeDeep<JSONSchema4['dependencies'] | JSONSchema6['dependencies']>
  exclusiveMinimum?: JSONSchema4['exclusiveMinimum'] | JSONSchema6['exclusiveMinimum']
  exclusiveMaximum?: JSONSchema4['exclusiveMaximum'] | JSONSchema6['exclusiveMaximum']
  not?: ReplaceSchemaType<JSONSchema4['not'] | JSONSchema6['not']>
  /**
   * schema extension to support defined enums
   */
  tsEnumNames?: string[]
  /**
   * schema extension to support using an enum
   */
  tsEnumRef?: JSONSchema
  /**
   * schema extension to support custom types
   */
  tsType?: string
  /**
   * schema extension to support generic parameter names
   */
  tsGenericParams?: string[]
  /**
   * schema extension to support generic parameter values
   */
  tsGenericValues?: {[key: string]: string[]}
}

// const SCHEMA_PROPERTIES = [
//   'additionalItems', 'additionalProperties', 'items', 'definitions',
//   'properties', 'patternProperties', 'dependencies', 'allOf', 'anyOf',
//   'oneOf', 'not', 'required', '$schema', 'title', 'description',
// ]

// export function isSchema(a: any): a is SchemaSchema {
//   return []
// }

export interface NormalizedJSONSchema extends Omit<JSONSchema, IncompatibleKeys> {
  additionalItems?: boolean | NormalizedJSONSchema
  additionalProperties: boolean | NormalizedJSONSchema
  items?: NormalizedJSONSchema | NormalizedJSONSchema[]
  definitions?: {
    [k: string]: NormalizedJSONSchema
  }
  properties?: {
    [k: string]: NormalizedJSONSchema
  }
  patternProperties?: {
    [k: string]: NormalizedJSONSchema
  }
  dependencies?: {
    [k: string]: NormalizedJSONSchema | string[]
  }
  allOf?: NormalizedJSONSchema[]
  anyOf?: NormalizedJSONSchema[]
  oneOf?: NormalizedJSONSchema[]
  not?: NormalizedJSONSchema
  required: string[]
}

export interface EnumJSONSchema extends NormalizedJSONSchema {
  enum: any[]
}

export interface NamedEnumJSONSchema extends NormalizedJSONSchema {
  tsEnumNames: string[]
}

export interface SchemaSchema extends NormalizedJSONSchema {
  properties: {
    [k: string]: NormalizedJSONSchema
  }
  required: string[]
}

export interface JSONSchemaWithDefinitions extends NormalizedJSONSchema {
  definitions: {
    [k: string]: NormalizedJSONSchema
  }
}

export interface CustomTypeJSONSchema extends NormalizedJSONSchema {
  tsType: string
}
