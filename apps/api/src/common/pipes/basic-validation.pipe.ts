import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from "@nestjs/common";

@Injectable()
export class BasicValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== "body" || value == null || typeof value !== "object") {
      return value;
    }

    const payload = value as Record<string, unknown>;

    for (const [key, fieldValue] of Object.entries(payload)) {
      if (fieldValue === "" || fieldValue === undefined) {
        throw new BadRequestException(`Field "${key}" is required`);
      }
    }

    return value;
  }
}

