export type Partner = {
  id: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PublicPartner = {
  id: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  sortOrder: number;
};

export type PartnerInput = {
  name: string;
  websiteUrl: string;
  isActive: boolean;
  sortOrder: number;
};
