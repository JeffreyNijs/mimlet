// NestJS's declarations need Node's types, so this file compiles with them.
import { ValidationPipe, type ValidationPipeOptions } from '@nestjs/common';
import * as classTransformer from 'class-transformer';
import * as classValidator from 'class-validator';
import {
  classValidatorSchema,
  fromClassValidator,
  type ClassValidatorSchemaOptions,
} from '@mimlet/class-validator';

class CreateOrderCommand {
  title?: string;
}

// The application's ValidationPipe options object fits unchanged, so one object can configure
// both the pipe and the builders.
const validationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
} satisfies ValidationPipeOptions;
new ValidationPipe(validationPipeOptions);
fromClassValidator(CreateOrderCommand, () => ({ title: 'Windows' }), validationPipeOptions);
declare const pipeOptions: ValidationPipeOptions;
const fromPipe: ClassValidatorSchemaOptions = pipeOptions;
classValidatorSchema(CreateOrderCommand, fromPipe);
// The libraries' module namespaces are valid packages, as in ValidationPipe.
classValidatorSchema(CreateOrderCommand, {
  validatorPackage: classValidator,
  transformerPackage: classTransformer,
});
