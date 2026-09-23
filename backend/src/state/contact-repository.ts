import type { DatabaseSync } from "node:sqlite";

import { notifyRemote } from "./database.js";
import { CONTACT_ROLES, type Area, type ContactRole } from "../contracts/api.js";

// Vive en app_metadata, no en el estado de la ejecución: un reset carga un fixture y se
// llevaría por delante los teléfonos que el responsable acaba de escribir en el panel.
const KEY_PREFIX = "contact_phone_";

interface Row {
  key: string;
  value: string;
}

export class ContactRepository {
  constructor(private readonly database: DatabaseSync) {}

  list(): Partial<Record<ContactRole, string>> {
    const rows = this.database
      .prepare("SELECT key, value FROM app_metadata WHERE key LIKE ?")
      .all(`${KEY_PREFIX}%`) as unknown as Row[];
    const phones: Partial<Record<ContactRole, string>> = {};
    for (const row of rows) {
      const role = row.key.slice(KEY_PREFIX.length) as ContactRole;
      if (row.value.trim() !== "") phones[role] = row.value;
    }
    return phones;
  }

  snapshot(): Record<ContactRole, string | null> {
    const stored = this.list();
    const phones = {} as Record<ContactRole, string | null>;
    for (const role of CONTACT_ROLES) phones[role] = stored[role] ?? null;
    return phones;
  }

  complete(): boolean {
    const stored = this.list();
    return CONTACT_ROLES.every((role) => Boolean(stored[role]));
  }

  get(area: string): string | undefined {
    const row = this.database
      .prepare("SELECT value FROM app_metadata WHERE key = ?")
      .get(`${KEY_PREFIX}${area}`) as { value: string } | undefined;
    return row?.value.trim() ? row.value : undefined;
  }

  set(area: ContactRole | Area, phone: string | null): void {
    if (phone === null) {
      this.database.prepare("DELETE FROM app_metadata WHERE key = ?").run(`${KEY_PREFIX}${area}`);
    } else {
      this.database
        .prepare(`
          INSERT INTO app_metadata (key, value)
          VALUES (?, ?)
          ON CONFLICT (key) DO UPDATE SET
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP
        `)
        .run(`${KEY_PREFIX}${area}`, phone);
    }
    notifyRemote(this.database);
  }
}
