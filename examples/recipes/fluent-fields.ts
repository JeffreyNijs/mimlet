import { fluent } from '@mimlet/core';
import { fromTypeBox, typeBoxFields } from '@mimlet/typebox-legacy';
import { Type, type TObject } from '@sinclair/typebox';

// One helper for every row schema: a setter per field, and no field list to maintain.
function rows<S extends TObject>(schema: S) {
  return fluent(fromTypeBox(schema), typeBoxFields(schema));
}

const Order = Type.Object({
  id: Type.String({ default: 'order-1' }),
  status: Type.Union([Type.Literal('NEW'), Type.Literal('PAID')], { default: 'NEW' }),
  total: Type.Number({ default: 0 }),
});

export const order = rows(Order).withStatus('PAID').withTotal(42).buildValidated();
// withStatus() accepts only 'NEW' or 'PAID', and withTotal() only numbers.
