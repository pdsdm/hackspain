export type Segment = "g-acceso" | "g-shuttles" | "g-propios";
export type Channel = "sms" | "email";

export interface AttendeesBrief {
  groupId: string;
  groupName: string;
  count: number;
  where: string;
  assignedSpaceName?: string;
  zone: "norte" | "sur";
  openingAt: number;
  needs?: string;
}

export interface GroupAnswer {
  id: string;
  sent: number;
  delivered: number;
  accepted: number;
  needsCovered?: boolean;
  pending?: string;
}

export interface GuestGroupUpdate {
  id: string;
  informedCount: number;
  acceptedCount: number;
  needs?: string;
}

export interface ExtractionIssue {
  code: "forma" | "grupo_desconocido" | "cuenta_invalida";
  detail: string;
}
