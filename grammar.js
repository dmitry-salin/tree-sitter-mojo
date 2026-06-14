/**
 * @file Mojo grammar for tree-sitter
 * @author Max Brunsfeld <maxbrunsfeld@gmail.com>
 * @license MIT
 * @see {@link https://mojolang.org/nightly/docs/reference/|Mojo reference}
 * @see {@link https://docs.python.org/2/reference/grammar.html|Python 2 grammar}
 * @see {@link https://docs.python.org/3/reference/grammar.html|Python 3 grammar}
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const PREC = {
  // this resolves a conflict between the usage of ':' in a lambda vs in a
  // typed parameter. In the case of a lambda, we don't allow typed parameters.
  lambda: -2,
  typed_parameter: -1,
  conditional: -1,

  parenthesized_expression: 1,
  parenthesized_list_splat: 1,
  or: 10,
  and: 11,
  not: 12,
  compare: 13,
  bitwise_or: 14,
  bitwise_and: 15,
  xor: 16,
  shift: 17,
  plus: 18,
  times: 19,
  unary: 20,
  power: 21,
  call: 22,
};

const SEMICOLON = ';';

export default grammar({
  name: 'mojo',

  extras: $ => [
    /[\s\f\uFEFF\u2060\u200B]|\r?\n/,
    $.comment,
    $.line_continuation,
  ],

  conflicts: $ => [
    [$.print_statement, $.primary_expression],
    [$.type_alias_statement, $.primary_expression],
    [$.with_item, $._collection_elements],
    [$.match_statement, $.primary_expression],
    [$.pattern, $.primary_expression],
    [$.list_pattern, $.list],
    [$.tuple_pattern, $.tuple],
    [$.list_splat_pattern, $.primary_expression],
    [$.as_pattern, $.named_expression],
  ],

  supertypes: $ => [
    $._simple_statement,
    $.expression_statement,
    $._compound_statement,
    $.parameter,
    $.pattern,
    $.expression,
    $.primary_expression,
  ],

  externals: $ => [
    $._newline,
    $._indent,
    $._dedent,
    $.string_start,
    $._string_content,
    $.escape_interpolation,
    $.string_end,

    // Mark comments as external tokens so that the external scanner is always
    // invoked, even if no external token is expected. This allows for better
    // error recovery, because the external scanner can maintain the overall
    // structure by returning dedent tokens whenever a dedent occurs, even
    // if no dedent is expected.
    $.comment,

    // Allow the external scanner to check for the validity of closing brackets
    // so that it can avoid returning dedent tokens between brackets.
    ']',
    ')',
    '}',
    'except',
  ],

  inline: $ => [
    $._simple_statement,
    $._compound_statement,
    $._function_effect,
    $._suite,
    $._lhs,
    $._expressions,
    $.keyword_identifier,
  ],

  reserved: {
    global: _ => [
      // https://docs.python.org/3/reference/lexical_analysis.html#keywords
      'False',
      'None',
      'True',
      'and',
      'as',
      'assert',
      'async',
      'await',
      'break',
      'class',
      'continue',
      'def',
      'del',
      'elif',
      'else',
      'except',
      'finally',
      'for',
      'from',
      'global',
      'if',
      'import',
      'in',
      'is',
      'lambda',
      'nonlocal',
      'not',
      'or',
      'pass',
      'raise',
      'return',
      'try',
      'while',
      'with',
      'yield',
    ],
  },

  word: $ => $.identifier,

  rules: {
    module: $ => repeat($._statement),

    _statement: $ => choice($._simple_statements, $._compound_statement),

    // Simple statements

    _simple_statements: $ =>
      seq(
        sep1($._simple_statement, SEMICOLON),
        optional(SEMICOLON),
        $._newline,
      ),

    _simple_statement: $ =>
      choice(
        $.import_statement,
        $.import_from_statement,
        $.future_import_statement,
        $.print_statement,
        $.assert_statement,
        $.return_statement,
        $.delete_statement,
        $.raise_statement,
        $.exec_statement,
        $.pass_statement,
        $.break_statement,
        $.continue_statement,
        $.global_statement,
        $.nonlocal_statement,
        $.type_alias_statement,
        $.expression_statement,
      ),

    import_statement: $ => seq('import', $._import_list),

    import_from_statement: $ =>
      seq(
        'from',
        field('module_name', choice($.relative_import, $.dotted_name)),
        'import',
        choice(
          $.wildcard_import,
          $._import_list,
          seq('(', $._import_list, ')'),
        ),
      ),

    relative_import: $ => seq($.import_prefix, optional($.dotted_name)),
    import_prefix: _ => repeat1('.'),
    dotted_name: $ => prec(1, sep1($.identifier, '.')),
    wildcard_import: _ => '*',

    future_import_statement: $ =>
      seq(
        'from',
        '__future__',
        'import',
        choice($._import_list, seq('(', $._import_list, ')')),
      ),

    _import_list: $ =>
      seq(
        commaSep1(field('name', choice($.dotted_name, $.aliased_import))),
        optional(','),
      ),

    aliased_import: $ =>
      seq(field('name', $.dotted_name), 'as', field('alias', $.identifier)),

    print_statement: $ =>
      choice(
        prec(
          1,
          seq(
            'print',
            $.chevron,
            repeat(seq(',', field('argument', $.expression))),
            optional(','),
          ),
        ),
        prec(
          -3,
          prec.dynamic(
            -1,
            seq(
              'print',
              commaSep1(field('argument', $.expression)),
              optional(','),
            ),
          ),
        ),
      ),

    chevron: $ => seq('>>', $.expression),

    assert_statement: $ => seq('assert', commaSep1($.expression)),
    return_statement: $ => seq('return', optional($._expressions)),
    delete_statement: $ => seq('del', $._expressions),

    raise_statement: $ =>
      seq(
        'raise',
        optional($._expressions),
        optional(seq('from', field('cause', $.expression))),
      ),

    exec_statement: $ =>
      seq(
        'exec',
        field('code', choice($.string, $.identifier)),
        optional(seq('in', commaSep1($.expression))),
      ),

    pass_statement: _ => prec.left('pass'),
    break_statement: _ => prec.left('break'),
    continue_statement: _ => prec.left('continue'),

    global_statement: $ => seq('global', commaSep1($.identifier)),
    nonlocal_statement: $ => seq('nonlocal', commaSep1($.identifier)),

    type_alias_statement: $ =>
      prec.dynamic(
        1,
        seq('type', field('left', $.type), '=', field('right', $.type)),
      ),

    expression_statement: $ =>
      choice(
        $.assignment,
        $.augmented_assignment,
        $.yield,
        $.tuple_expression,
        $.expression,
      ),

    // Compound statements

    _compound_statement: $ =>
      choice(
        $.if_statement,
        $.for_statement,
        $.while_statement,
        $.try_statement,
        $.with_statement,
        $.match_statement,
        $.function_definition,
        $.class_definition,
        $.decorated_definition,
      ),

    if_statement: $ =>
      seq(
        'if',
        field('condition', $.expression),
        ':',
        field('consequence', $._suite),
        repeat(field('alternative', $.elif_clause)),
        optional(field('alternative', $.else_clause)),
      ),

    elif_clause: $ =>
      seq(
        'elif',
        field('condition', $.expression),
        ':',
        field('consequence', $._suite),
      ),

    else_clause: $ => seq('else', ':', field('body', $._suite)),

    for_statement: $ =>
      seq(
        optional('async'),
        'for',
        field('left', $._lhs),
        'in',
        field('right', $._expressions),
        ':',
        field('body', $._suite),
        field('alternative', optional($.else_clause)),
      ),

    for_in_clause: $ =>
      prec.left(
        seq(
          optional('async'),
          'for',
          field('left', $._lhs),
          'in',
          field('right', commaSep1($._expression_within_for_in_clause)),
          optional(','),
        ),
      ),

    while_statement: $ =>
      seq(
        'while',
        field('condition', $.expression),
        ':',
        field('body', $._suite),
        optional(field('alternative', $.else_clause)),
      ),

    try_statement: $ =>
      seq(
        'try',
        ':',
        field('body', $._suite),
        repeat($.except_clause),
        optional($.else_clause),
        optional($.finally_clause),
      ),

    except_clause: $ =>
      seq(
        'except',
        optional(token(prec(1, '*'))),
        optional(
          choice(
            seq(
              field('value', $.expression),
              optional(seq('as', field('alias', $.expression))),
            ),
            commaSep1(field('value', $.expression)),
          ),
        ),
        ':',
        $._suite,
      ),

    finally_clause: $ => seq('finally', ':', $._suite),

    with_statement: $ =>
      seq(
        optional('async'),
        'with',
        $.with_clause,
        ':',
        field('body', $._suite),
      ),

    with_clause: $ =>
      choice(
        seq(commaSep1($.with_item), optional(',')),
        seq('(', commaSep1($.with_item), optional(','), ')'),
      ),

    with_item: $ => prec.dynamic(1, seq(field('value', $.expression))),

    match_statement: $ =>
      seq(
        'match',
        commaSep1(field('subject', $.expression)),
        optional(','),
        ':',
        field('body', alias($._match_block, $.block)),
      ),

    _match_block: $ =>
      choice(
        $._newline,
        seq($._indent, repeat(field('alternative', $.case_clause)), $._dedent),
      ),

    case_clause: $ =>
      seq(
        'case',
        commaSep1($.case_pattern),
        optional(','),
        optional(field('guard', $.if_clause)),
        ':',
        field('consequence', $._suite),
      ),

    if_clause: $ => seq('if', $.expression),

    function_definition: $ =>
      seq($._function_signature, ':', field('body', $._suite)),

    _function_signature: $ =>
      seq(
        optional('async'),
        'def',
        field('name', $.identifier),
        $._function_parameters,
        field('effects', optional($.function_effects)),
        optional($._function_return_type),
      ),

    _function_parameters: $ =>
      seq(
        field('type_parameters', optional($.type_parameters)),
        field('parameters', $.parameters),
      ),

    function_effects: $ => repeat1($._function_effect),
    _function_effect: $ => choice($.raises, $.abi),

    raises: $ =>
      prec.left(seq('raises', field('error_type', optional($.type)))),

    abi: $ => seq('abi', '(', $.string, ')'),

    _function_return_type: $ =>
      prec.left(seq('->', field('return_type', $.type))),

    class_definition: $ => seq($._class_header, ':', field('body', $._suite)),

    _class_header: $ =>
      seq(
        choice('class', 'struct'),
        field('name', $.identifier),
        field('type_parameters', optional($.type_parameters)),
        field('superclasses', optional($.argument_list)),
      ),

    decorated_definition: $ =>
      seq(
        repeat1($.decorator),
        field('definition', choice($.function_definition, $.class_definition)),
      ),

    decorator: $ => seq('@', $.expression, $._newline),

    _suite: $ =>
      choice(
        alias($._newline, $.block),
        seq($._indent, $.block),
        alias($._simple_statements, $.block),
      ),

    block: $ => seq(repeat($._statement), $._dedent),

    // Parameters

    type_parameters: $ => seq('[', commaSep1($.type), optional(','), ']'),

    parameters: $ => seq('(', optional($._parameters), ')'),
    lambda_parameters: $ => $._parameters,
    _parameters: $ => seq(commaSep1($.parameter), optional(',')),

    parameter: $ =>
      choice(
        $.default_parameter,
        $.typed_parameter,
        $.typed_default_parameter,
        $.tuple_pattern,
        $.list_splat_pattern,
        $.dictionary_splat_pattern,
        $.identifier,
        $.positional_separator,
        $.keyword_separator,
      ),

    default_parameter: $ =>
      seq(
        field('name', choice($.tuple_pattern, $.identifier)),
        '=',
        field('value', $.expression),
      ),

    typed_parameter: $ =>
      prec(
        PREC.typed_parameter,
        seq(
          optional($._convention),
          choice(
            $.list_splat_pattern,
            $.dictionary_splat_pattern,
            field('name', $.identifier),
          ),
          ':',
          field('type', $.type),
        ),
      ),

    typed_default_parameter: $ =>
      prec(
        PREC.typed_parameter,
        seq(
          optional($._convention),
          field('name', $.identifier),
          ':',
          field('type', $.type),
          '=',
          field('value', $.expression),
        ),
      ),

    _convention: $ => choice('read', 'mut', 'out', 'deinit', 'var', 'ref'),

    // Types

    type: $ =>
      choice(
        $.splat_type,
        $.generic_type,
        $.union_type,
        $.constrained_type,
        $.member_type,
        prec(1, $.expression),
      ),
    splat_type: $ => prec(1, seq(choice('*', '**'), $.identifier)),
    generic_type: $ =>
      prec(
        1,
        seq(
          choice($.identifier, alias('type', $.identifier)),
          $.type_parameters,
        ),
      ),
    union_type: $ => prec.left(seq($.type, '|', $.type)),
    constrained_type: $ => prec.right(seq($.type, ':', $.type)),
    member_type: $ => seq($.type, '.', $.identifier),

    // Arguments

    argument_list: $ =>
      seq(
        '(',
        optional(
          commaSep1(
            choice(
              $.list_splat,
              alias($.parenthesized_list_splat, $.parenthesized_expression),
              $.dictionary_splat,
              $.keyword_argument,
              $.expression,
            ),
          ),
        ),
        optional(','),
        ')',
      ),

    list_splat: $ => seq('*', $.expression),

    parenthesized_list_splat: $ =>
      prec(
        PREC.parenthesized_list_splat,
        seq(
          '(',
          choice(
            $.list_splat,
            alias($.parenthesized_list_splat, $.parenthesized_expression),
          ),
          ')',
        ),
      ),

    dictionary_splat: $ => seq('**', $.expression),

    keyword_argument: $ =>
      seq(
        field('name', choice($.identifier, $.keyword_identifier)),
        '=',
        field('value', $.expression),
      ),

    // Assignment

    assignment: $ =>
      seq(
        optional($._declaration_convention),
        field('left', $._lhs),
        $._assignment_rhs,
      ),

    _declaration_convention: $ => choice('var', 'ref'),

    _lhs: $ => choice($.pattern_list, $.pattern),

    _rhs: $ =>
      choice(
        $.assignment,
        $.augmented_assignment,
        $.pattern_list,
        $.yield,
        $.expression_list,
        $.expression,
      ),

    _assignment_rhs: $ =>
      choice(
        seq('=', field('right', $._rhs)),
        seq(':', field('type', $.type)),
        seq(':', field('type', $.type), '=', field('right', $._rhs)),
      ),

    augmented_assignment: $ =>
      seq(
        field('left', $._lhs),
        field(
          'operator',
          choice(
            '+=',
            '-=',
            '*=',
            '/=',
            '@=',
            '//=',
            '%=',
            '**=',
            '>>=',
            '<<=',
            '&=',
            '^=',
            '|=',
          ),
        ),
        field('right', $._rhs),
      ),

    // Match cases

    case_pattern: $ =>
      prec(
        1,
        choice(
          alias($._case_as_pattern, $.as_pattern),
          $.keyword_pattern,
          $._simple_pattern,
        ),
      ),

    _case_as_pattern: $ => seq($.case_pattern, 'as', $.identifier),

    keyword_pattern: $ => seq($.identifier, '=', $._simple_pattern),

    _simple_pattern: $ =>
      prec(
        1,
        choice(
          $.class_pattern,
          $.splat_pattern,
          $.union_pattern,
          alias($._list_pattern, $.list_pattern),
          alias($._tuple_pattern, $.tuple_pattern),
          $.dict_pattern,
          $.complex_pattern,
          $.concatenated_string,
          $.string,
          seq(optional('-'), choice($.integer, $.float)),
          $.dotted_name,
          $.true,
          $.false,
          $.none,
          '_',
        ),
      ),

    class_pattern: $ =>
      seq(
        $.dotted_name,
        '(',
        optional(seq(commaSep1($.case_pattern), optional(','))),
        ')',
      ),

    splat_pattern: $ =>
      prec(1, seq(choice('*', '**'), choice($.identifier, '_'))),

    union_pattern: $ =>
      prec.right(
        seq($._simple_pattern, repeat1(prec.left(seq('|', $._simple_pattern)))),
      ),

    _list_pattern: $ =>
      seq('[', optional(seq(commaSep1($.case_pattern), optional(','))), ']'),

    _tuple_pattern: $ =>
      seq('(', optional(seq(commaSep1($.case_pattern), optional(','))), ')'),

    dict_pattern: $ =>
      seq(
        '{',
        optional(
          seq(
            commaSep1(choice($.splat_pattern, $._key_value_pattern)),
            optional(','),
          ),
        ),
        '}',
      ),

    _key_value_pattern: $ =>
      seq(field('key', $._simple_pattern), ':', field('value', $.case_pattern)),

    complex_pattern: $ =>
      prec(
        1,
        seq(
          optional('-'),
          choice($.integer, $.float),
          choice('+', '-'),
          choice($.integer, $.float),
        ),
      ),

    // Patterns

    pattern_list: $ =>
      seq(
        $.pattern,
        choice(',', seq(repeat1(seq(',', $.pattern)), optional(','))),
      ),

    pattern: $ =>
      choice(
        $.list_pattern,
        $.tuple_pattern,
        $.list_splat_pattern,
        $.attribute,
        $.subscript,
        $.identifier,
        $.keyword_identifier,
      ),

    list_pattern: $ => seq('[', optional($._patterns), ']'),
    tuple_pattern: $ => seq('(', optional($._patterns), ')'),
    _patterns: $ => seq(commaSep1($.pattern), optional(',')),

    list_splat_pattern: $ =>
      seq(
        '*',
        choice($.attribute, $.subscript, $.identifier, $.keyword_identifier),
      ),

    dictionary_splat_pattern: $ =>
      seq(
        '**',
        choice($.attribute, $.subscript, $.identifier, $.keyword_identifier),
      ),

    // Extended patterns (patterns allowed in match statement are far more flexible than simple patterns though still a subset of "expression")

    as_pattern: $ =>
      prec.left(
        seq(
          $.expression,
          'as',
          field('alias', alias($.expression, $.as_pattern_target)),
        ),
      ),

    // Expressions

    slice: $ =>
      seq(
        optional($.expression),
        ':',
        optional($.expression),
        optional(seq(':', optional($.expression))),
      ),

    yield: $ =>
      prec.right(
        seq(
          'yield',
          choice(seq('from', $.expression), optional($._expressions)),
        ),
      ),

    _expressions: $ => choice($.expression_list, $.expression),

    expression_list: $ =>
      prec.right(
        seq(
          $.expression,
          choice(',', seq(repeat1(seq(',', $.expression)), optional(','))),
        ),
      ),

    tuple_expression: $ =>
      seq(
        $.expression,
        ',',
        optional(seq(commaSep1($.expression), optional(','))),
      ),

    expression: $ =>
      choice(
        $.as_pattern,
        $.lambda,
        $.conditional_expression,
        $.named_expression,
        $.comparison_operator,
        $.not_operator,
        $.boolean_operator,
        $.primary_expression,
      ),

    lambda: $ =>
      prec(
        PREC.lambda,
        seq(
          'lambda',
          field('parameters', optional($.lambda_parameters)),
          ':',
          field('body', $.expression),
        ),
      ),

    lambda_within_for_in_clause: $ =>
      seq(
        'lambda',
        field('parameters', optional($.lambda_parameters)),
        ':',
        field('body', $._expression_within_for_in_clause),
      ),

    _expression_within_for_in_clause: $ =>
      choice($.expression, alias($.lambda_within_for_in_clause, $.lambda)),

    conditional_expression: $ =>
      prec.right(
        PREC.conditional,
        seq($.expression, 'if', $.expression, 'else', $.expression),
      ),

    named_expression: $ =>
      seq(
        field('name', $._named_expression_lhs),
        ':=',
        field('value', $.expression),
      ),

    _named_expression_lhs: $ => choice($.identifier, $.keyword_identifier),

    comparison_operator: $ =>
      prec.left(
        PREC.compare,
        seq(
          $.primary_expression,
          repeat1(
            seq(
              field(
                'operators',
                choice(
                  '<',
                  '<=',
                  '==',
                  '!=',
                  '>=',
                  '>',
                  '<>',
                  'in',
                  alias($._not_in, 'not in'),
                  'is',
                  alias($._is_not, 'is not'),
                ),
              ),
              $.primary_expression,
            ),
          ),
        ),
      ),

    _not_in: _ => seq('not', 'in'),
    _is_not: _ => seq('is', 'not'),

    not_operator: $ =>
      prec(PREC.not, seq('not', field('argument', $.expression))),

    boolean_operator: $ =>
      choice(
        prec.left(
          PREC.and,
          seq(
            field('left', $.expression),
            field('operator', 'and'),
            field('right', $.expression),
          ),
        ),
        prec.left(
          PREC.or,
          seq(
            field('left', $.expression),
            field('operator', 'or'),
            field('right', $.expression),
          ),
        ),
      ),

    primary_expression: $ =>
      choice(
        alias($.list_splat_pattern, $.list_splat),
        $.call,
        $.await,
        $.attribute,
        $.subscript,
        $.binary_operator,
        $.unary_operator,
        $.list_comprehension,
        $.set_comprehension,
        $.dictionary_comprehension,
        $.parenthesized_expression,
        $.generator_expression,
        $.tuple,
        $.list,
        $.set,
        $.dictionary,
        $.concatenated_string,
        $.string,
        $.integer,
        $.float,
        $.identifier,
        $.keyword_identifier,
        $.true,
        $.false,
        $.none,
        $.ellipsis,
      ),

    call: $ =>
      prec(
        PREC.call,
        seq(
          field('function', $.primary_expression),
          field('arguments', choice($.argument_list, $.generator_expression)),
        ),
      ),

    await: $ => prec(PREC.unary, seq('await', $.primary_expression)),

    attribute: $ =>
      prec(
        PREC.call,
        seq(
          field('object', $.primary_expression),
          '.',
          field('attribute', $.identifier),
        ),
      ),

    subscript: $ =>
      prec(
        PREC.call,
        seq(
          field('value', $.primary_expression),
          '[',
          commaSep1(field('subscript', choice($.slice, $.expression))),
          optional(','),
          ']',
        ),
      ),

    binary_operator: $ => {
      const table = [
        [prec.left, '+', PREC.plus],
        [prec.left, '-', PREC.plus],
        [prec.left, '*', PREC.times],
        [prec.left, '@', PREC.times],
        [prec.left, '/', PREC.times],
        [prec.left, '%', PREC.times],
        [prec.left, '//', PREC.times],
        [prec.right, '**', PREC.power],
        [prec.left, '|', PREC.bitwise_or],
        [prec.left, '&', PREC.bitwise_and],
        [prec.left, '^', PREC.xor],
        [prec.left, '<<', PREC.shift],
        [prec.left, '>>', PREC.shift],
      ];

      // @ts-ignore
      return choice(
        ...table.map(([fn, operator, precedence]) =>
          fn(
            precedence,
            seq(
              field('left', $.primary_expression),
              // @ts-ignore
              field('operator', operator),
              field('right', $.primary_expression),
            ),
          ),
        ),
      );
    },

    unary_operator: $ =>
      prec(
        PREC.unary,
        seq(
          field('operator', choice('+', '-', '~')),
          field('argument', $.primary_expression),
        ),
      ),

    // Comprehensions

    list_comprehension: $ =>
      seq('[', field('body', $.expression), $._comprehension_clauses, ']'),

    set_comprehension: $ =>
      seq('{', field('body', $.expression), $._comprehension_clauses, '}'),

    dictionary_comprehension: $ =>
      seq('{', field('body', $.pair), $._comprehension_clauses, '}'),

    _comprehension_clauses: $ =>
      seq($.for_in_clause, repeat(choice($.for_in_clause, $.if_clause))),

    // Parenthesized expressions

    parenthesized_expression: $ =>
      prec(
        PREC.parenthesized_expression,
        seq('(', choice($.yield, $.expression), ')'),
      ),

    generator_expression: $ =>
      seq('(', field('body', $.expression), $._comprehension_clauses, ')'),

    // Tuple

    tuple: $ => seq('(', optional($._collection_elements), ')'),

    // Collection displays

    list: $ => seq('[', optional($._collection_elements), ']'),
    set: $ => seq('{', $._collection_elements, '}'),
    dictionary: $ =>
      seq(
        '{',
        optional(commaSep1(choice($.dictionary_splat, $.pair))),
        optional(','),
        '}',
      ),

    pair: $ =>
      seq(field('key', $.expression), ':', field('value', $.expression)),

    _collection_elements: $ =>
      seq(
        commaSep1(
          choice(
            $.list_splat,
            $.parenthesized_list_splat,
            $.yield,
            $.expression,
          ),
        ),
        optional(','),
      ),

    concatenated_string: $ => seq($.string, repeat1($.string)),

    string: $ =>
      seq(
        $.string_start,
        repeat(choice($.interpolation, $.string_content)),
        $.string_end,
      ),

    interpolation: $ =>
      seq(
        '{',
        field('expression', $._f_expression),
        optional('='),
        optional(field('type_conversion', $.type_conversion)),
        optional(field('format_specifier', $.format_specifier)),
        '}',
      ),

    _f_expression: $ =>
      choice($.pattern_list, $.yield, $.expression_list, $.expression),

    type_conversion: _ => /![a-z]/,

    format_specifier: $ =>
      seq(
        ':',
        repeat(
          choice(
            token(prec(1, /[^{}\n]+/)),
            alias($.interpolation, $.format_expression),
          ),
        ),
      ),

    string_content: $ =>
      prec.right(
        repeat1(
          choice(
            $._string_content,
            $.escape_interpolation,
            $.escape_sequence,
            $._not_escape_sequence,
          ),
        ),
      ),

    escape_sequence: _ =>
      token.immediate(
        prec(
          1,
          seq(
            '\\',
            choice(
              /u[a-fA-F\d]{4}/,
              /U[a-fA-F\d]{8}/,
              /x[a-fA-F\d]{2}/,
              /\d{1,3}/,
              /\r?\n/,
              /['"abfrntv\\]/,
              /N\{[^}]+\}/,
            ),
          ),
        ),
      ),

    _not_escape_sequence: _ => token.immediate('\\'),

    integer: _ =>
      token(
        choice(
          seq(choice('0x', '0X'), repeat1(/_?[A-Fa-f0-9]+/), optional(/[Ll]/)),
          seq(choice('0o', '0O'), repeat1(/_?[0-7]+/), optional(/[Ll]/)),
          seq(choice('0b', '0B'), repeat1(/_?[0-1]+/), optional(/[Ll]/)),
          seq(
            repeat1(/[0-9]+_?/),
            choice(
              optional(/[Ll]/), // long numbers
              optional(/[jJ]/), // complex numbers
            ),
          ),
        ),
      ),

    float: _ => {
      const digits = repeat1(/[0-9]+_?/);
      const exponent = seq(/[eE][\+-]?/, digits);

      return token(
        seq(
          choice(
            seq(digits, '.', optional(digits), optional(exponent)),
            seq(optional(digits), '.', digits, optional(exponent)),
            seq(digits, exponent),
          ),
          optional(/[jJ]/),
        ),
      );
    },

    identifier: _ => /[_\p{XID_Start}][_\p{XID_Continue}]*/,

    keyword_identifier: $ =>
      choice(
        prec(
          -3,
          alias(choice('print', 'exec', 'async', 'await'), $.identifier),
        ),
        alias(choice('type', 'match'), $.identifier),
      ),

    true: _ => 'True',
    false: _ => 'False',
    none: _ => 'None',

    ellipsis: _ => '...',

    positional_separator: _ => '/',
    keyword_separator: _ => '*',

    comment: _ => token(seq('#', /.*/)),

    line_continuation: _ =>
      token(seq('\\', choice(seq(optional('\r'), '\n'), '\0'))),
  },
});

export {PREC};

/**
 * Creates a rule to match one or more of the rules separated by a comma
 *
 * @param {RuleOrLiteral} rule
 *
 * @returns {SeqRule}
 */
function commaSep1(rule) {
  return sep1(rule, ',');
}

/**
 * Creates a rule to match one or more occurrences of `rule` separated by `sep`
 *
 * @param {RuleOrLiteral} rule
 *
 * @param {RuleOrLiteral} separator
 *
 * @returns {SeqRule}
 */
function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}
