// Validation + dịch lỗi cho form cập nhật thông tin cá nhân (PUT /api/users/{id}).
// BE (UpdateUserRequest) yêu cầu BẮT BUỘC: fullname (≤100), birthdate (yyyy-MM-dd),
// address (≤255), gender (enum). FE validate trước để người dùng không bị BE trả
// lỗi khó hiểu, và dịch lỗi field từ BE sang tiếng Việt nếu vẫn lọt.

export interface UserProfileFormValues {
  fullname: string;
  birthdate: string;
  address: string;
  gender: string;
  email?: string;
}

export type UserProfileFieldErrors = Partial<Record<keyof UserProfileFormValues, string>>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Cùng mức kiểm tra format với [EmailAddress] DataAnnotation ở BE — email là optional,
// chỉ validate format khi người dùng có nhập.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Cắt birthdate về dạng yyyy-MM-dd để hợp với input[type=date] (phòng khi BE trả ISO datetime). */
export function toDateInputValue(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.slice(0, 10);
}

/** Gia sư phải từ 18 tuổi (cùng quy định với BE — AgeHelper.MinTutorAge — và app ghi âm). */
export const TUTOR_MIN_AGE = 18;

/** Số tuổi tròn tính tới hôm nay theo ngày sinh yyyy-MM-dd. */
export function ageFromBirthdate(birthdate: string, today: Date = new Date()): number {
  const [y, m, d] = birthdate.split('-').map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age;
}

/** Ngày sinh muộn nhất (yyyy-MM-dd) vẫn đủ [minAge] tuổi — dùng cho `max` của input date. */
export function latestBirthdateForAge(minAge: number, today: Date = new Date()): string {
  const d = new Date(today.getFullYear() - minAge, today.getMonth(), today.getDate());
  if (d.getMonth() !== today.getMonth()) d.setDate(0); // 29/02 → 28/02 năm thường
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Validate khớp BE UpdateUserRequest. Trả map lỗi theo field (rỗng = hợp lệ). */
export function validateUserProfileForm(
  form: UserProfileFormValues,
  options: { minAge?: number } = {},
): UserProfileFieldErrors {
  const errors: UserProfileFieldErrors = {};

  const fullname = form.fullname.trim();
  if (!fullname) errors.fullname = 'Vui lòng nhập họ và tên.';
  else if (fullname.length > 100) errors.fullname = 'Họ và tên không được vượt quá 100 ký tự.';

  if (!form.birthdate) {
    errors.birthdate = 'Vui lòng chọn ngày sinh.';
  } else if (!DATE_RE.test(form.birthdate) || Number.isNaN(Date.parse(form.birthdate))) {
    errors.birthdate = 'Ngày sinh không hợp lệ (định dạng yyyy-MM-dd).';
  } else if (new Date(form.birthdate) > new Date()) {
    errors.birthdate = 'Ngày sinh không được ở tương lai.';
  } else if (options.minAge != null && ageFromBirthdate(form.birthdate) < options.minAge) {
    errors.birthdate = `Phải từ ${options.minAge} tuổi trở lên.`;
  }

  const address = form.address.trim();
  if (!address) errors.address = 'Vui lòng nhập địa chỉ.';
  else if (address.length > 255) errors.address = 'Địa chỉ không được vượt quá 255 ký tự.';

  if (!form.gender) errors.gender = 'Vui lòng chọn giới tính.';

  const email = form.email?.trim();
  if (email && !EMAIL_RE.test(email)) errors.email = 'Email không đúng định dạng.';

  return errors;
}

const FIELD_KEYS: Record<string, keyof UserProfileFormValues> = {
  fullname: 'fullname',
  birthdate: 'birthdate',
  address: 'address',
  gender: 'gender',
  email: 'email',
};

const FIELD_VI_MESSAGE: Record<keyof UserProfileFormValues, string> = {
  fullname: 'Họ và tên không hợp lệ.',
  birthdate: 'Ngày sinh không hợp lệ (định dạng yyyy-MM-dd).',
  address: 'Địa chỉ không hợp lệ.',
  gender: 'Giới tính không hợp lệ.',
  email: 'Email không đúng định dạng hoặc đã được sử dụng.',
};

/**
 * Dịch object lỗi field từ BE (vd `error: { birthdate: ["..."] }`) sang map lỗi tiếng Việt theo field.
 * Khớp key không phân biệt hoa/thường và bỏ tiền tố "$." của lỗi deserialize JSON.
 */
export function mapApiFieldErrors(apiError: unknown): UserProfileFieldErrors {
  const out: UserProfileFieldErrors = {};
  if (!apiError || typeof apiError !== 'object') return out;

  for (const rawKey of Object.keys(apiError as Record<string, unknown>)) {
    const normalized = rawKey.replace(/^\$\./, '').toLowerCase();
    const field = FIELD_KEYS[normalized];
    if (field) out[field] = FIELD_VI_MESSAGE[field];
  }
  return out;
}
