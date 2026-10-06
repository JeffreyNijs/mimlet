---
'@mimlet/core': minor
---

Build class instances, such as TypeORM entities, and change what builds return.
`createInstanceBuilder(Class, factory, config)` patches the class's plain record
(`InstanceInput<T>`: data fields, no methods, readonly properties optional) and creates a new
instance on every build, with `new Class()` or, with `construct: 'prototype'`, without running
the constructor. A record value for a getter without a setter throws, and a transform added
after the mapping must return an instance of the class. `builder.map(mapper)` is a transform
whose result may have another type: patches keep the input type, builds return the mapped
value, and `fluent()` setters stay typed. `intoClass(Class)` is the mapper on its own.

`Builder` and `AsyncBuilder` get an `Output` type parameter, `Builder<T, Args, Output = T,
Received = Args>`, and the facades follow; `Received` (new in this train) moves after it.
Schema builders have no `map()`. `describe().operations` lists `'map'`. A `fluent()` alias or
generated method named `map` now collides with the builder capability.
