import {whiteBright} from 'cli-color'
import {JSONSchema4Type, JSONSchema4TypeName} from 'json-schema'
import {isEqual, findKey, includes, isPlainObject, map} from 'lodash'
import {format} from 'util'
import {Options} from './'
import {typeOfSchema} from './typeOfSchema'
import {
  AST,
  hasStandaloneName,
  T_ANY,
  T_ANY_ADDITIONAL_PROPERTIES,
  TInterface,
  TInterfaceParam,
  TNamedInterface,
  TTuple,
  TNamedInterfaceIntersection,
  TInterfaceIntersection
} from './types/AST'
import {JSONSchema, JSONSchemaWithDefinitions, SchemaSchema} from './types/JSONSchema'
import {INDEX_KEY_NAME, generateName, log, error} from './utils'

const raise = (message: string, ...messages: any[]): never => {
  error(message, ...messages)
  throw new Error(message)
}

export type Processed = Map<JSONSchema | JSONSchema4Type, AST>

export type UsedNames = Set<string>

export function parse(
  schema: JSONSchema | JSONSchema4Type,
  options: Options,
  rootSchema = schema as JSONSchema,
  keyName?: string,
  isSchema = true,
  processed: Processed = new Map<JSONSchema | JSONSchema4Type, AST>(),
  usedNames = new Set<string>()
): AST {
  // If we've seen this node before, return it.
  let existing = processed.get(schema)
  if (!existing && typeof schema === 'object' && schema) {
    for (let iterKeys = processed.keys(), iter = iterKeys.next(); !iter.done; iter = iterKeys.next()) {
      const candidate = iter.value
      if (typeof candidate === 'object' && candidate && isEqual(schema, candidate)) {
        existing = processed.get(candidate)!
        processed.set(schema, existing)
      }
    }
  }
  if (existing) {
    // But update the keyName if it didn't already have one
    if (keyName && existing.keyName === undefined) {
      existing.keyName = keyName
    }
    return existing
  }

  const definitions = getDefinitions(rootSchema)
  const keyNameFromDefinition = findKey(definitions, _ => isEqual(_, schema))

  // Cache processed ASTs before they are actually computed, then update
  // them in place using set(). This is to avoid cycles.
  // TODO: Investigate alternative approaches (lazy-computing nodes, etc.)
  const ast = {} as AST
  processed.set(schema, ast)
  const set = (_ast: AST) => Object.assign(ast, _ast)

  return isSchema
    ? parseNonLiteral(
        schema as SchemaSchema,
        options,
        rootSchema,
        keyName,
        keyNameFromDefinition,
        set,
        processed,
        usedNames
      )
    : parseLiteral(schema, keyName, keyNameFromDefinition, set)
}

function parseLiteral(
  schema: JSONSchema4Type,
  keyName: string | undefined,
  keyNameFromDefinition: string | undefined,
  set: (ast: AST) => AST
) {
  return set({
    keyName,
    params: schema,
    standaloneName: keyNameFromDefinition,
    type: 'LITERAL'
  })
}

function parseNonLiteral(
  schema: JSONSchema,
  options: Options,
  rootSchema: JSONSchema,
  keyName: string | undefined,
  keyNameFromDefinition: string | undefined,
  set: (ast: AST) => AST,
  processed: Processed,
  usedNames: UsedNames
): AST {
  log(whiteBright.bgBlue('parser'), schema, '<-' + typeOfSchema(schema), processed.has(schema) ? '(FROM CACHE)' : '')

  switch (typeOfSchema(schema)) {
    case 'ALL_OF':
      return set({
        comment: schema.description,
        keyName,
        params: schema.allOf!.map(_ => parse(_, options, rootSchema, undefined, true, processed, usedNames)),
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        type: 'INTERSECTION'
      })
    case 'ANY':
      return set({
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        type: 'ANY'
      })
    case 'ANY_OF':
      return set({
        comment: schema.description,
        keyName,
        params: schema.anyOf!.map(_ => parse(_, options, rootSchema, undefined, true, processed, usedNames)),
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        type: 'UNION'
      })
    case 'BOOLEAN':
      return set({
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        type: 'BOOLEAN'
      })
    case 'CUSTOM_TYPE':
      return set({
        comment: schema.description,
        keyName,
        params: schema.tsType!,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        type: 'CUSTOM_TYPE'
      })
    case 'NAMED_ENUM':
      return set({
        comment: schema.description,
        keyName,
        params: schema.enum!.map((_, n) => ({
          ast: parse(_, options, rootSchema, undefined, false, processed, usedNames),
          keyName: schema.tsEnumNames![n]
        })),
        standaloneName:
          standaloneName(schema, keyName, usedNames) || raise('Named enum requires a standalone name', schema),
        type: 'ENUM'
      })
    case 'NAMED_SCHEMA':
      return set(newInterface(schema as SchemaSchema, options, rootSchema, processed, usedNames, keyName))
    case 'NEVER':
      return set({
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        type: 'NEVER'
      })
    case 'NULL':
      return set({
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        type: 'NULL'
      })
    case 'NUMBER':
      return set({
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        type: 'NUMBER'
      })
    case 'OBJECT':
      return set({
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        type: 'OBJECT'
      })
    case 'ONE_OF':
      return set({
        comment: schema.description,
        keyName,
        params: schema.oneOf!.map(_ => parse(_, options, rootSchema, undefined, true, processed, usedNames)),
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        type: 'UNION'
      })
    case 'REFERENCE':
      throw Error(format('Refs should have been resolved by the resolver!', schema))
    case 'STRING':
      return set({
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        type: 'STRING'
      })
    case 'TYPED_ARRAY':
      if (Array.isArray(schema.items)) {
        // normalised to not be undefined
        const minItems = schema.minItems!
        const maxItems = schema.maxItems!
        const arrayType: TTuple = {
          comment: schema.description,
          keyName,
          maxItems,
          minItems,
          params: schema.items.map(_ => parse(_, options, rootSchema, undefined, true, processed, usedNames)),
          standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
          type: 'TUPLE'
        }
        if (schema.additionalItems === true) {
          arrayType.spreadParam = {
            type: 'ANY'
          }
        } else if (schema.additionalItems) {
          arrayType.spreadParam = parse(
            schema.additionalItems,
            options,
            rootSchema,
            undefined,
            true,
            processed,
            usedNames
          )
        }
        return set(arrayType)
      } else {
        const params = parse(schema.items!, options, rootSchema, undefined, true, processed, usedNames)
        return set({
          comment: schema.description,
          keyName,
          params,
          standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
          type: 'ARRAY'
        })
      }
    case 'UNION':
      return set({
        comment: schema.description,
        keyName,
        params: (schema.type as JSONSchema4TypeName[]).map(_ =>
          parse({...schema, type: _}, options, rootSchema, undefined, true, processed, usedNames)
        ),
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        type: 'UNION'
      })
    case 'UNNAMED_ENUM':
      if (schema.tsEnumRef) {
        const enumAst = parse(schema.tsEnumRef, options, rootSchema, undefined, false, processed, usedNames)
        if (enumAst.type !== 'ENUM') {
          throw Error(format('tsEnumRef does not resolve to an enum!', schema))
        }
        const params = schema.enum!.map<AST>(_value => {
          const enumParam = enumAst.params.find(_ => _.ast.type === 'LITERAL' && _.ast.params === _value)
          if (!enumParam) {
            throw new Error(format('%j does not exist in referenced enum', _value, schema))
          }
          return {
            params: [enumAst, enumParam],
            type: 'TYPE_REFERENCE'
          }
        })
        return set({
          comment: schema.description,
          keyName,
          params,
          standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
          type: 'UNION'
        })
      }
      return set({
        comment: schema.description,
        keyName,
        params: schema.enum!.map(_ => parse(_, options, rootSchema, undefined, false, processed, usedNames)),
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        type: 'UNION'
      })
    case 'UNNAMED_SCHEMA':
      return set(
        newInterface(schema as SchemaSchema, options, rootSchema, processed, usedNames, keyName, keyNameFromDefinition)
      )
    case 'UNTYPED_ARRAY':
      // normalised to not be undefined
      const minItems = schema.minItems!
      const maxItems = typeof schema.maxItems === 'number' ? schema.maxItems : -1
      const params = T_ANY
      if (minItems > 0 || maxItems >= 0) {
        return set({
          comment: schema.description,
          keyName,
          maxItems: schema.maxItems,
          minItems,
          // create a tuple of length N
          params: Array(Math.max(maxItems, minItems) || 0).fill(params),
          // if there is no maximum, then add a spread item to collect the rest
          spreadParam: maxItems >= 0 ? undefined : params,
          standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
          type: 'TUPLE'
        })
      }

      return set({
        comment: schema.description,
        keyName,
        params,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        type: 'ARRAY'
      })
  }
}

/**
 * Compute a schema name using a series of fallbacks
 */
function standaloneName(
  schema: JSONSchema,
  keyNameFromDefinition: string | undefined,
  usedNames: UsedNames
): string | undefined {
  const name = schema.title || schema.id || keyNameFromDefinition
  if (name) {
    return generateName(name, usedNames)
  }
}

/**
 * New interface _OR_ named object definition
 */
function newInterface(
  schema: SchemaSchema,
  options: Options,
  rootSchema: JSONSchema,
  processed: Processed,
  usedNames: UsedNames,
  keyName?: string,
  keyNameFromDefinition?: string
): TInterface | TInterfaceIntersection {
  const name = standaloneName(schema, keyNameFromDefinition, usedNames)!
  const params = parseSchema(schema, options, rootSchema, processed, usedNames, name)

  const propertyNamesSchema = schema.propertyNames
  if (
    propertyNamesSchema &&
    propertyNamesSchema !== true &&
    !((propertyNamesSchema.pattern || propertyNamesSchema.format) && !propertyNamesSchema.enum)
  ) {
    if (schema.extends) {
      // Don't use < draft4 features with a draft6+ feature.
      throw Error(format('Supertype forbidden with propertyNames!', schema))
    }
    const paramsKeyType = parse(propertyNamesSchema, options, rootSchema, undefined, true, processed, usedNames)
    const comment = `This interface was referenced by \`${name}\`'s JSON-Schema definition
  via \`propertyNames\`.`
    paramsKeyType.comment = paramsKeyType.comment ? `${paramsKeyType.comment}\n\n${comment}` : comment

    if (!hasStandaloneName(paramsKeyType)) {
      throw Error(format('Type for property names must have standalone name!', propertyNamesSchema, paramsKeyType))
    }

    const additionalPropIndex = params.findIndex(param => param.keyName === INDEX_KEY_NAME)
    const additionalProp: TInterfaceParam =
      additionalPropIndex >= 0
        ? params[additionalPropIndex]
        : {
            ast: {type: 'ANY'},
            keyName: INDEX_KEY_NAME,
            isPatternProperty: false,
            isRequired: false,
            isUnreachableDefinition: false
          }
    if (additionalPropIndex >= 0) {
      params.splice(additionalPropIndex, 1)
    }
    const mappedType: TInterface = {
      paramsKeyType,
      params: [additionalProp],
      superTypes: [],
      type: 'INTERFACE'
    }
    const rootType = {
      keyName,
      standaloneName: name,
      comment: schema.description,
      tsGenericParams: schema.tsGenericParams,
      tsGenericValues: schema.tsGenericValues
    }
    // TODO: handle "required".
    if (params.length === 0) {
      additionalProp.keyName = `[K in ${paramsKeyType.standaloneName}]`
      return {...mappedType, ...rootType}
    }
    const knownKeys = params.map(param => JSON.stringify(param.keyName)).join(' | ')
    additionalProp.keyName = `[K in Exclude<${paramsKeyType.standaloneName}, ${knownKeys}>]`
    return {
      ...rootType,
      params: [mappedType, {params, superTypes: [], type: 'INTERFACE'}],
      type: 'INTERSECTION'
    }
  }

  return {
    comment: schema.description,
    keyName,
    params,
    standaloneName: name,
    superTypes: parseSuperTypes(schema, options, processed, usedNames),
    tsGenericParams: schema.tsGenericParams,
    tsGenericValues: schema.tsGenericValues,
    type: 'INTERFACE'
  }
}

function parseSuperTypes(
  schema: SchemaSchema,
  options: Options,
  processed: Processed,
  usedNames: UsedNames
): (TNamedInterface | TNamedInterfaceIntersection)[] {
  // Type assertion needed because of dereferencing step
  // TODO: Type it upstream
  const superTypes = schema.extends as SchemaSchema | SchemaSchema[] | undefined
  if (!superTypes) {
    return []
  }
  if (Array.isArray(superTypes)) {
    return superTypes.map(_ => newNamedInterface(_, options, _, processed, usedNames))
  }
  return [newNamedInterface(superTypes, options, superTypes, processed, usedNames)]
}

function newNamedInterface(
  schema: SchemaSchema,
  options: Options,
  rootSchema: JSONSchema,
  processed: Processed,
  usedNames: UsedNames
): TNamedInterface | TNamedInterfaceIntersection {
  const namedInterface = newInterface(schema, options, rootSchema, processed, usedNames)
  if (hasStandaloneName(namedInterface)) {
    return namedInterface
  }
  // TODO: Generate name if it doesn't have one
  throw Error(format('Supertype must have standalone name!', namedInterface))
}

/**
 * Helper to parse schema properties into params on the parent schema's type
 */
function parseSchema(
  schema: SchemaSchema,
  options: Options,
  rootSchema: JSONSchema,
  processed: Processed,
  usedNames: UsedNames,
  parentSchemaName: string
): TInterfaceParam[] {
  let asts: TInterfaceParam[] = map(schema.properties, (value, key: string) => ({
    ast: parse(value, options, rootSchema, key, true, processed, usedNames),
    isPatternProperty: false,
    isRequired: includes(schema.required || [], key),
    isUnreachableDefinition: false,
    keyName: key
  }))

  let singlePatternProperty = false
  if (schema.patternProperties) {
    // partially support patternProperties. in the case that
    // additionalProperties is not set, and there is only a single
    // value definition, we can validate against that.
    singlePatternProperty = !schema.additionalProperties && Object.keys(schema.patternProperties).length === 1

    asts = asts.concat(
      map(schema.patternProperties, (value, key: string) => {
        const ast = parse(value, options, rootSchema, key, true, processed, usedNames)
        const comment = `This interface was referenced by \`${parentSchemaName}\`'s JSON-Schema definition
via the \`patternProperty\` "${key}".`
        ast.comment = ast.comment ? `${ast.comment}\n\n${comment}` : comment
        return {
          ast,
          isPatternProperty: !singlePatternProperty,
          isRequired: singlePatternProperty || includes(schema.required || [], key),
          isUnreachableDefinition: false,
          keyName: singlePatternProperty ? INDEX_KEY_NAME : key
        }
      })
    )
  }

  if (options.unreachableDefinitions) {
    asts = asts.concat(
      map(schema.definitions, (value, key: string) => {
        const ast = parse(value, options, rootSchema, key, true, processed, usedNames)
        const comment = `This interface was referenced by \`${parentSchemaName}\`'s JSON-Schema
via the \`definition\` "${key}".`
        ast.comment = ast.comment ? `${ast.comment}\n\n${comment}` : comment
        return {
          ast,
          isPatternProperty: false,
          isRequired: includes(schema.required || [], key),
          isUnreachableDefinition: true,
          keyName: key
        }
      })
    )
  }

  // handle additionalProperties
  switch (schema.additionalProperties) {
    case true:
      if (singlePatternProperty) {
        return asts
      }
      return asts.concat({
        ast: T_ANY_ADDITIONAL_PROPERTIES,
        isPatternProperty: false,
        isRequired: true,
        isUnreachableDefinition: false,
        keyName: INDEX_KEY_NAME
      })

    case undefined:
    case false:
      return asts

    // pass "true" as the last param because in TS, properties
    // defined via index signatures are already optional
    default:
      return asts.concat({
        ast: parse(schema.additionalProperties, options, rootSchema, INDEX_KEY_NAME, true, processed, usedNames),
        isPatternProperty: false,
        isRequired: true,
        isUnreachableDefinition: false,
        keyName: INDEX_KEY_NAME
      })
  }
}

type Definitions = {[k: string]: JSONSchema}

/**
 * TODO: Memoize
 */
function getDefinitions(schema: JSONSchema, isSchema = true, processed = new Set<JSONSchema>()): Definitions {
  if (processed.has(schema)) {
    return {}
  }
  processed.add(schema)
  if (Array.isArray(schema)) {
    return schema.reduce(
      (prev, cur) => ({
        ...prev,
        ...getDefinitions(cur, false, processed)
      }),
      {}
    )
  }
  if (isPlainObject(schema)) {
    return {
      ...(isSchema && hasDefinitions(schema) ? schema.definitions : {}),
      ...Object.keys(schema).reduce<Definitions>(
        (prev, cur) => ({
          ...prev,
          ...getDefinitions(schema[cur], false, processed)
        }),
        {}
      )
    }
  }
  return {}
}

/**
 * TODO: Reduce rate of false positives
 */
function hasDefinitions(schema: JSONSchema): schema is JSONSchemaWithDefinitions {
  return 'definitions' in schema
}
