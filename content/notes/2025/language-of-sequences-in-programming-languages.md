+++
title = 'Language of Sequences in Programming Languages'
author = 'Edwin Kofler'
date = 2025-06-08 21:25:42Z
categories = []
tags = ['programming-languages']
+++

> In mathematics, a _sequence_ is an enumerated collection of objects in which repetitions are allowed and order matters. [Wikipedia](https://en.wikipedia.org/wiki/Sequence)

The mathematical concept of sequences naturally occurs in all useful programming languages. I wanted to review how different programming languages describe the concept.

Syntactically, it's usually seen in two ways:

**`for` loops**. They require:

- A starting statement
- An ending condition
- An "after iteration" statement

**`foreach` loops**. They require:

- An object to loop through

Both:

1. Take a sequence
2. Perform the iteration

Usually, these concepts are described using the words:

1. loop, enumerable, list, array, iterable, sequence, collection, vector
2. loop, enumerate, iterate, go through

Which words should I use?

## Word Usage by Programming Languages

Investigating further, I wanted to see how these concepts were described by popular programming languages and sources. Here are the quotes of select sources:

In the [Python reference](https://docs.python.org/3.12/reference/compound_stmts.html#the-for-statement):

> The `for` statement is used to iterate over the elements of a sequence (such as a string, tuple or list) or other iterable object:

In the [Python tutorial](https://docs.python.org/3/tutorial/controlflow.html#for-statements):

> The `for` statement in Python differs a bit from what you may be used to in C or Pascal. [...] Python’s for statement iterates over the items of any sequence (a list or a string), in the order that they appear in the sequence. For example (no pun intended):

In the [ECMAScript Specification](https://262.ecma-international.org/14.0/#sec-for-statement):

Information about `for` is under the header of "iteration statements".

In [Rust by Example](https://doc.rust-lang.org/rust-by-example/flow_control/for.html):

> The for in construct can be used to iterate through an Iterator. One of the easiest ways to create an iterator is to use the range notation a..b. This yields values from a (inclusive) to b (exclusive) in steps of one.

In the [Ruby documentation](https://docs.ruby-lang.org/en/3.4/syntax/control_expressions_rdoc.html#label-for+Loop):

> The `for` loop consists of for followed by a variable to contain the iteration argument followed by in and the value to iterate over using each. The do is optional:

In [cppreference.com](https://en.cppreference.com/w/cpp/language/for.html):

> Conditionally executes a statement repeatedly, where the statement does not need to manage the loop condition.

In K&R,

Information about `for` is under the header of "3.5 Loops - While and For".

## Chosen Words

I learned that _iterate_ is used much more frequently than I previously thought. I also realized that I've underused the word _sequence_.

In the context of programming, I'll share the words that I like the most.

When speaking about a _sequence_:

- Prefer _sequence_
- Prefer _list_, It's quicker to say, but only if context already exists (word is overloaded in English)
- Avoid _iterable_ unless talking about Python's iterable object
- Avoid _vector_, _array_, _iterable_, or _enumerable_ unless talking about the use of those things in a programming language
- Avoid _loop_ unless talking about the syntax of iterating through lists in programming languages. The noun form is overloaded in English

When speaking about the action of _iterating_:

- Prefer _iterate_
- Prefer _loop_. It's quicker to say, but only if context already exists (word is overloaded in English)
- Avoid _enumerate_ and _go through_. They are vague
