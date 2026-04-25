export interface Employee {
  id: string;
  name: string;
  title: string;
  department: string;
  email: string;
  phone: string;
  avatar: string;
  reportsTo: string | null;
}
