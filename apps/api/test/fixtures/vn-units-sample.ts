// Bộ dữ liệu đơn vị hành chính mẫu, cùng định dạng với nguồn vietnamese-provinces-database.
/** Bộ dữ liệu mẫu nhỏ theo đúng định dạng nguồn: 2 tỉnh, 3 xã. */
export function sampleDataset() {
  return [
    {
      Code: '01',
      Name: 'Hà Nội',
      NameEn: 'Hanoi',
      FullName: 'Thành phố Hà Nội',
      AdministrativeUnitId: 1,
      Wards: [
        {
          Code: '00004',
          Name: 'Ba Đình',
          NameEn: 'Ba Dinh',
          FullName: 'Phường Ba Đình',
          ProvinceCode: '01',
          PostalCode: '11120',
          AdministrativeUnitId: 3,
        },
        {
          Code: '00008',
          Name: 'Ngọc Hà',
          NameEn: 'Ngoc Ha',
          FullName: 'Phường Ngọc Hà',
          ProvinceCode: '01',
          PostalCode: '11110',
          AdministrativeUnitId: 3,
        },
      ],
    },
    {
      Code: '91',
      Name: 'An Giang',
      NameEn: 'An Giang',
      FullName: 'Tỉnh An Giang',
      AdministrativeUnitId: 2,
      Wards: [
        {
          Code: '31105',
          Name: 'Phú Quốc',
          NameEn: 'Phu Quoc',
          FullName: 'Đặc khu Phú Quốc',
          ProvinceCode: '91',
          PostalCode: '92500',
          AdministrativeUnitId: 5,
        },
      ],
    },
  ];
}
