import { UserRole } from './constants.ts';

export { UserRole };

export interface User {
  _id: string;
  id?: string;
  displayName: string;
  email: string;
  role: UserRole;
  region?: string; // PSGC Region ID
  isActive?: boolean;
  mustChangePassword?: boolean;
}

export interface Report {
  _id: string;
  cooperativeName: string;
  registrationNumber: string;
  reportType: string;
  submissionDate: string;
  status: string;
  region?: string; // Region where the report belongs
  createdAt: string;
  uploadedBy: string | { displayName: string; region?: string };
}

export interface DashboardStats {
  totalReports: number;
  statusDistribution: { _id: string; count: number }[];
  regionDistribution: { _id: string; count: number }[];
  provinceDistribution?: { _id: string; count: number }[];
  cooperativeTypeDistribution?: { _id: string; count: number }[];
  latestReports: Report[];
}
