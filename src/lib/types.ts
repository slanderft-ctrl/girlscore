export type Profile = {
  id: string;
  phone: string | null;
  full_name: string | null;
  email: string | null;
  notes: string | null;
  is_admin: boolean;
  created_at: string;
};

export type PassType = {
  id: string;
  name: string;
  description: string | null;
  visits: number;
  valid_days: number;
  price_minor: number;
  currency: string;
  active: boolean;
  sort_order: number;
};

export type ClientPass = {
  id: string;
  client_id: string;
  pass_type_id: string;
  payment_id: string | null;
  visits_total: number;
  visits_left: number;
  valid_days: number;
  first_class_at: string | null;
  expires_at: string | null;
  status: "active" | "used_up" | "expired" | "cancelled";
  created_at: string;
  pass_types?: Pick<PassType, "name"> | null;
};

export type Group = {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  location: string | null;
  active: boolean;
  sort_order: number;
};

export type GroupTime = {
  id: string;
  group_id: string;
  weekday: number; // 1 = Monday
  start_time: string; // "18:00:00"
  end_time: string;
  active: boolean;
};

export type Session = {
  id: string;
  group_id: string;
  group_time_id: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  cancelled: boolean;
  locked_at: string | null;
  groups?: Pick<Group, "name" | "location"> | null;
};

export type AttendanceStatus = "coming" | "absent" | "no_pass" | "attended" | "no_show" | "cancelled";

export type Attendance = {
  id: string;
  session_id: string;
  client_id: string;
  kind: "regular" | "single";
  status: AttendanceStatus;
  client_pass_id: string | null;
  counted_at: string | null;
};

export type Pause = { id: string; client_id: string; starts_on: string; ends_on: string };
