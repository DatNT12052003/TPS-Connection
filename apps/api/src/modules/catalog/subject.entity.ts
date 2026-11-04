import { EntitySchema } from 'typeorm';

export type Subject = {
  id: string;
  nameVi: string;
  nameEn: string;
  isActive: boolean;
};

export const SubjectEntity = new EntitySchema<Subject>({
  name: 'Subject',
  tableName: 'subjects',
  columns: {
    id: { type: 'uuid', primary: true },
    nameVi: { type: 'text', name: 'name_vi' },
    nameEn: { type: 'text', name: 'name_en' },
    isActive: { type: 'boolean', name: 'is_active' },
  },
});
