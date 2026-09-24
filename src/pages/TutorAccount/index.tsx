import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import { getApiErrorMessage } from '../../utils/apiError';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { getUserIdFromToken, changePassword } from '../../services/auth.service';
import { getUserProfile, updateUserProfile, updateUserAvatar } from '../../services/user.service';
import { formatDateTime } from '../../utils/formatters';
import { PageContainer } from '../../components/shared';
import {
    validateUserProfileForm,
    TUTOR_MIN_AGE,
    latestBirthdateForAge,
    mapApiFieldErrors,
    toDateInputValue,
    type UserProfileFieldErrors,
} from '../../utils/userProfileForm';
import styles from './styles.module.css';

interface UserProfileData {
    userid: string;
    email: string;
    fullname: string;
    phone?: string;
    birthdate?: string;
    address?: string;
    gender?: string;
    avatarurl?: string;
    role?: string;
    createdat?: string;
    lastloginat?: string;
    isidentityverified?: boolean;
}

interface EditForm {
    fullname: string;
    birthdate: string;
    address: string;
    gender: string;
    email: string;
}

interface PasswordForm {
    oldPassword: string;
    newPassword: string;
    confirmPassword: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const validateImageFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
        return 'Chỉ hỗ trợ ảnh định dạng JPEG, PNG hoặc WebP';
    }
    if (file.size > MAX_FILE_SIZE) {
        return `Kích thước ảnh không được vượt quá 5MB (hiện tại: ${(file.size / 1024 / 1024).toFixed(1)}MB)`;
    }
    return null;
};

const getCroppedImg = (imageSrc: string, pixelCrop: Area): Promise<Blob> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => {
            const canvas = document.createElement('canvas');
            canvas.width = pixelCrop.width;
            canvas.height = pixelCrop.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error('No canvas context')); return; }
            ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
            canvas.toBlob(blob => {
                if (!blob) { reject(new Error('Canvas is empty')); return; }
                resolve(blob);
            }, 'image/jpeg', 0.92);
        });
        image.addEventListener('error', reject);
        image.src = imageSrc;
    });

const TutorAccount = () => {
    const [profile, setProfile] = useState<UserProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [viewingAvatar, setViewingAvatar] = useState(false);
    const avatarInputRef = useRef<HTMLInputElement>(null);

    const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
        setCroppedAreaPixels(croppedPixels);
    }, []);

    const [form, setForm] = useState<EditForm>({
        fullname: '',
        birthdate: '',
        address: '',
        gender: '',
        email: '',
    });
    const [errors, setErrors] = useState<UserProfileFieldErrors>({});
    const [showPasswordSection, setShowPasswordSection] = useState(false);
    const [passwordForm, setPasswordForm] = useState<PasswordForm>({
        oldPassword: '',
        newPassword: '',
        confirmPassword: '',
    });
    const [changingPassword, setChangingPassword] = useState(false);
    const [showOldPw, setShowOldPw] = useState(false);
    const [showNewPw, setShowNewPw] = useState(false);
    const [showConfirmPw, setShowConfirmPw] = useState(false);

    useEffect(() => {
        const loadProfile = async () => {
            const userId = getUserIdFromToken();
            if (!userId) {
                setLoading(false);
                return;
            }
            try {
                const res = await getUserProfile();
                const data = res.content ?? res;
                if (!data || !data.userid) {
                    throw new Error('Dữ liệu người dùng không hợp lệ');
                }
                setProfile(data);
                setForm({
                    fullname: data.fullname || '',
                    birthdate: toDateInputValue(data.birthdate),
                    address: data.address || '',
                    gender: data.gender || '',
                    email: data.email || '',
                });
            } catch (error) {
                toast.error(getApiErrorMessage(error, 'Không thể tải thông tin tài khoản'));
            } finally {
                setLoading(false);
            }
        };
        loadProfile();
    }, []);

    const updateField = (field: keyof EditForm, value: string) => {
        setForm(f => ({ ...f, [field]: value }));
        setErrors(e => (e[field] ? { ...e, [field]: undefined } : e));
    };

    // BE chặn và bỏ qua thay đổi họ tên/ngày sinh khi CCCD đã xác thực (UserService.UpdateUserAsync) — khóa luôn ở FE.
    const identityLocked = profile?.isidentityverified === true;

    const handleSave = async () => {
        if (!profile) return;

        // BE yêu cầu đủ tất cả các trường — validate trước để báo rõ field thiếu/sai.
        const fieldErrors = validateUserProfileForm(form, { minAge: TUTOR_MIN_AGE });
        if (Object.keys(fieldErrors).length > 0) {
            setErrors(fieldErrors);
            toast.warning('Vui lòng điền đầy đủ và đúng các thông tin bắt buộc.');
            return;
        }
        setErrors({});

        setSaving(true);
        try {
            await updateUserProfile(profile.userid, {
                fullname: form.fullname.trim(),
                birthdate: form.birthdate,
                address: form.address.trim(),
                gender: form.gender,
                email: form.email.trim() || undefined,
                avatarurl: profile.avatarurl,
            });
            setProfile(prev => prev ? { ...prev, ...form } : null);
            window.dispatchEvent(new CustomEvent('profile-name-updated', { detail: form.fullname.trim() }));
            setEditing(false);
            toast.success('Cập nhật thông tin thành công!');
        } catch (err: unknown) {
            const apiError = (err as { response?: { data?: { error?: unknown; message?: string } } })?.response?.data;
            const mapped = mapApiFieldErrors(apiError?.error);
            if (/email.*already exist/i.test(apiError?.message || '')) {
                setErrors(e => ({ ...e, email: 'Email này đã được sử dụng bởi tài khoản khác.' }));
                toast.error('Email này đã được sử dụng bởi tài khoản khác.');
            } else if (Object.keys(mapped).length > 0) {
                setErrors(mapped);
                toast.error('Vui lòng kiểm tra lại các thông tin được đánh dấu.');
            } else {
                toast.error(getApiErrorMessage(err, 'Cập nhật thất bại. Vui lòng thử lại.'));
            }
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        if (profile) {
            setForm({
                fullname: profile.fullname || '',
                birthdate: toDateInputValue(profile.birthdate),
                address: profile.address || '',
                gender: profile.gender || '',
                email: profile.email || '',
            });
        }
        setErrors({});
        setEditing(false);
    };

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !profile) return;
        if (avatarInputRef.current) avatarInputRef.current.value = '';

        const error = validateImageFile(file);
        if (error) {
            toast.error(error);
            return;
        }

        const url = URL.createObjectURL(file);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setCroppedAreaPixels(null);
        setPendingFile(file);
        setPreviewUrl(url);
    };

    const handleConfirmUpload = async () => {
        if (!previewUrl || !croppedAreaPixels || !profile) return;
        setUploadingAvatar(true);
        try {
            const croppedBlob = await getCroppedImg(previewUrl, croppedAreaPixels);
            const croppedFile = new File([croppedBlob], pendingFile?.name ?? 'avatar.jpg', { type: 'image/jpeg' });
            const res = await updateUserAvatar(profile.userid, croppedFile);
            const newUrl = res.content?.avatarUrl;
            if (newUrl) {
                setProfile(prev => prev ? { ...prev, avatarurl: newUrl } : null);
                window.dispatchEvent(new CustomEvent('avatar-updated', { detail: newUrl }));
            }
            toast.success('Cập nhật ảnh đại diện thành công!');
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'Không thể cập nhật ảnh đại diện. Vui lòng thử lại.'));
        } finally {
            setUploadingAvatar(false);
            handleCancelPreview();
        }
    };

    const handleCancelPreview = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPendingFile(null);
        setPreviewUrl(null);
        setCroppedAreaPixels(null);
    };

    const handleChangePassword = async () => {
        if (!passwordForm.oldPassword || !passwordForm.newPassword) {
            toast.warning('Vui lòng điền đầy đủ thông tin');
            return;
        }
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            toast.error('Mật khẩu mới không khớp');
            return;
        }
        if (passwordForm.newPassword.length < 8) {
            toast.warning('Mật khẩu mới phải có ít nhất 8 ký tự');
            return;
        }
        if (passwordForm.newPassword === passwordForm.oldPassword) {
            toast.error('Mật khẩu mới không được trùng với mật khẩu cũ. Vui lòng chọn mật khẩu khác.');
            return;
        }
        setChangingPassword(true);
        try {
            await changePassword(passwordForm.oldPassword, passwordForm.newPassword);
            toast.success('Đổi mật khẩu thành công!');
            setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
            setShowPasswordSection(false);
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'Đổi mật khẩu thất bại. Vui lòng thử lại.'));
        } finally {
            setChangingPassword(false);
        }
    };

    const getPasswordStrength = (pw: string) => {
        if (!pw) return { label: '', color: '', width: '0%' };
        let score = 0;
        if (pw.length >= 8) score++;
        if (pw.length >= 12) score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;
        if (score <= 1) return { label: 'Yếu', color: '#631b1b', width: '25%' };
        if (score <= 3) return { label: 'Trung bình', color: '#d4b483', width: '60%' };
        return { label: 'Mạnh', color: '#3d4a3e', width: '100%' };
    };

    const pwStrength = getPasswordStrength(passwordForm.newPassword);
    const isChangePasswordDisabled =
        changingPassword ||
        !passwordForm.oldPassword.trim() ||
        !passwordForm.newPassword.trim() ||
        !passwordForm.confirmPassword.trim();

    const getInitials = (name: string) => {
        const parts = name.trim().split(' ');
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    };

    const formatDate = (date: string | undefined) => {
        if (!date) return '—';
        try {
            return new Date(date + 'T00:00:00').toLocaleDateString('vi-VN');
        } catch {
            return date;
        }
    };

    const genderDisplay = (g: string | undefined) => {
        if (g === 'Male') return 'Nam';
        if (g === 'Female') return 'Nữ';
        if (g === 'Other') return 'Khác';
        return '—';
    };

    if (loading) {
        return (
            <PageContainer
                className={styles.page}
                title="Tài khoản"
                titleInfo="Quản lý thông tin cá nhân và cài đặt tài khoản."
                maxWidth="standard"
            >
                <div style={{ textAlign: 'center', color: '#737373', padding: 48 }}>Đang tải...</div>
            </PageContainer>
        );
    }

    const displayName = profile?.fullname || 'Tutor';
    const initials = getInitials(displayName);

    return (
        <PageContainer
            className={styles.page}
            title="Tài khoản"
            titleInfo="Quản lý thông tin cá nhân và cài đặt tài khoản."
            maxWidth="standard"
        >
            {/* Avatar Crop Modal */}
            {previewUrl && (
                <div className={styles.modalOverlay} onClick={handleCancelPreview}>
                    <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3 className={styles.modalTitle}>Chỉnh sửa ảnh đại diện</h3>
                            <p className={styles.modalSubtitle}>Kéo để di chuyển · Cuộn để phóng to</p>
                        </div>

                        <div className={styles.cropContainer}>
                            <Cropper
                                image={previewUrl}
                                crop={crop}
                                zoom={zoom}
                                aspect={1}
                                cropShape="round"
                                showGrid={false}
                                onCropChange={setCrop}
                                onZoomChange={setZoom}
                                onCropComplete={onCropComplete}
                            />
                        </div>

                        <div className={styles.zoomControl}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                            </svg>
                            <input
                                type="range"
                                min={1}
                                max={3}
                                step={0.05}
                                value={zoom}
                                onChange={e => setZoom(Number(e.target.value))}
                                className={styles.zoomSlider}
                            />
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                        </div>

                        <div className={styles.modalActions}>
                            <button className={styles.modalCancelBtn} onClick={handleCancelPreview} type="button">
                                Hủy
                            </button>
                            <button
                                className={styles.modalConfirmBtn}
                                onClick={handleConfirmUpload}
                                disabled={uploadingAvatar}
                                type="button"
                            >
                                {uploadingAvatar ? (
                                    <>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
                                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                                        </svg>
                                        Đang tải lên...
                                    </>
                                ) : 'Lưu ảnh đại diện'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Avatar Lightbox */}
            {viewingAvatar && profile?.avatarurl && (
                <div className={styles.lightboxOverlay} onClick={() => setViewingAvatar(false)}>
                    <div className={styles.lightboxContent} onClick={e => e.stopPropagation()}>
                        <button className={styles.lightboxClose} onClick={() => setViewingAvatar(false)} aria-label="Đóng">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                        <img src={profile.avatarurl} alt={displayName} className={styles.lightboxImg} />
                        <p className={styles.lightboxName}>{displayName}</p>
                    </div>
                </div>
            )}

            {/* Profile Header Card */}
            <div className={styles.profileCard} data-tour="account-profile-card">
                <div className={styles.avatarGroup}>
                    <div
                        className={styles.avatarWrapper}
                        onClick={() => profile?.avatarurl && setViewingAvatar(true)}
                        title={profile?.avatarurl ? 'Nhấn để xem ảnh' : undefined}
                    >
                        {profile?.avatarurl ? (
                            <img src={profile.avatarurl} alt={displayName} style={avatarImg} />
                        ) : (
                            <span style={avatarInitials}>{initials}</span>
                        )}
                        {profile?.avatarurl && (
                            <div className={styles.avatarViewOverlay}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                </svg>
                            </div>
                        )}
                    </div>
                    <button
                        className={styles.avatarChangeBtn}
                        onClick={() => avatarInputRef.current?.click()}
                        title="Đổi ảnh đại diện"
                        type="button"
                    >
                        {uploadingAvatar ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
                                <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                            </svg>
                        ) : (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                                <circle cx="12" cy="13" r="4" />
                            </svg>
                        )}
                    </button>
                </div>
                <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleAvatarChange} />
                <div style={profileMeta}>
                    <h2 style={profileName}>{displayName}</h2>
                    <span style={roleBadge}>GIA SƯ</span>
                    {profile?.createdat && (
                        <p style={memberSince}>
                            Thành viên từ {new Date(profile.createdat).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}
                        </p>
                    )}
                    {(profile?.lastloginat || (profile as any)?.lastLoginAt) && (
                        <p style={{ ...memberSince, marginTop: 4 }}>
                            Đăng nhập lần cuối: {formatDateTime(profile?.lastloginat || (profile as any)?.lastLoginAt)}
                        </p>
                    )}
                </div>
                {!editing && (
                    <button style={editBtn} onClick={() => setEditing(true)} type="button">
                        Chỉnh sửa
                    </button>
                )}
            </div>

            {/* Personal Info Section */}
            <div className={styles.sectionCard} data-tour="account-personal-info">
                <div style={sectionHeader}>
                    <h3 style={sectionTitle}>Thông tin cá nhân</h3>
                </div>

                <div className={styles.fieldGrid}>
                    <div style={fieldGroup}>
                        <label style={fieldLabel}>Số điện thoại</label>
                        <p style={{ ...fieldValue, color: profile?.phone ? '#1a2238' : '#9ca3af' }}>
                            {profile?.phone || 'Chưa cập nhật'}
                        </p>
                    </div>

                    <div style={fieldGroup}>
                        <label style={fieldLabel}>Email</label>
                        {editing ? (
                            <>
                                <input
                                    style={{ ...fieldInput, ...(errors.email ? { borderColor: '#dc2626' } : {}) }}
                                    type="email"
                                    value={form.email}
                                    onChange={e => updateField('email', e.target.value)}
                                    maxLength={100}
                                    placeholder="Nhập email"
                                />
                                {errors.email && <span style={errorTextStyle}>{errors.email}</span>}
                            </>
                        ) : (
                            <p style={{ ...fieldValue, color: profile?.email ? '#1a2238' : '#9ca3af' }}>
                                {profile?.email || 'Chưa cập nhật'}
                            </p>
                        )}
                    </div>

                    <div style={fieldGroup}>
                        <label style={fieldLabel}>Họ và tên{editing && <span style={{ color: '#dc2626' }}> *</span>}</label>
                        {editing ? (
                            <>
                                <input
                                    style={{
                                        ...fieldInput,
                                        ...(errors.fullname ? { borderColor: '#dc2626' } : {}),
                                        ...(identityLocked ? disabledStyle : {}),
                                    }}
                                    value={form.fullname}
                                    onChange={e => updateField('fullname', e.target.value)}
                                    maxLength={100}
                                    placeholder="Nhập họ và tên"
                                    disabled={identityLocked}
                                />
                                {identityLocked ? (
                                    <span style={readOnlyHint}>Đã xác minh qua CCCD, không thể chỉnh sửa.</span>
                                ) : (
                                    errors.fullname && <span style={errorTextStyle}>{errors.fullname}</span>
                                )}
                            </>
                        ) : (
                            <p style={fieldValue}>{profile?.fullname || '—'}</p>
                        )}
                    </div>

                    <div style={fieldGroup}>
                        <label style={fieldLabel}>Ngày sinh{editing && <span style={{ color: '#dc2626' }}> *</span>}</label>
                        {editing ? (
                            <>
                                <input
                                    style={{
                                        ...fieldInput,
                                        ...(errors.birthdate ? { borderColor: '#dc2626' } : {}),
                                        ...(identityLocked ? disabledStyle : {}),
                                    }}
                                    type="date"
                                    value={form.birthdate}
                                    max={latestBirthdateForAge(TUTOR_MIN_AGE)}
                                    onChange={e => updateField('birthdate', e.target.value)}
                                    disabled={identityLocked}
                                />
                                {identityLocked ? (
                                    <span style={readOnlyHint}>Đã xác minh qua CCCD, không thể chỉnh sửa.</span>
                                ) : (
                                    errors.birthdate && <span style={errorTextStyle}>{errors.birthdate}</span>
                                )}
                            </>
                        ) : (
                            <p style={fieldValue}>{formatDate(profile?.birthdate)}</p>
                        )}
                    </div>

                    <div style={fieldGroup}>
                        <label style={fieldLabel}>Giới tính{editing && <span style={{ color: '#dc2626' }}> *</span>}</label>
                        {editing ? (
                            <>
                                <select
                                    style={{
                                        ...fieldInput,
                                        ...(errors.gender ? { borderColor: '#dc2626' } : {}),
                                        ...(identityLocked ? disabledSelectStyle : {}),
                                    }}
                                    value={form.gender}
                                    onChange={e => updateField('gender', e.target.value)}
                                    disabled={identityLocked}
                                >
                                    <option value="">Chọn giới tính</option>
                                    <option value="Male">Nam</option>
                                    <option value="Female">Nữ</option>
                                    <option value="Other">Khác</option>
                                </select>
                                {identityLocked ? (
                                    <span style={readOnlyHint}>Đã xác minh qua CCCD, không thể chỉnh sửa.</span>
                                ) : (
                                    errors.gender && <span style={errorTextStyle}>{errors.gender}</span>
                                )}
                            </>
                        ) : (
                            <p style={fieldValue}>{genderDisplay(profile?.gender)}</p>
                        )}
                    </div>

                    <div style={{ ...fieldGroup, gridColumn: '1 / -1' }}>
                        <label style={fieldLabel}>Địa chỉ{editing && <span style={{ color: '#dc2626' }}> *</span>}</label>
                        {editing ? (
                            <>
                                <input
                                    style={{ ...fieldInput, ...(errors.address ? { borderColor: '#dc2626' } : {}) }}
                                    value={form.address}
                                    onChange={e => updateField('address', e.target.value)}
                                    maxLength={255}
                                    placeholder="Nhập địa chỉ"
                                />
                                {errors.address && <span style={errorTextStyle}>{errors.address}</span>}
                            </>
                        ) : (
                            <p style={fieldValue}>{profile?.address || '—'}</p>
                        )}
                    </div>
                </div>

                {editing && (
                    <div style={actionRow}>
                        <button style={cancelBtn} onClick={handleCancel} type="button">Hủy</button>
                        <button
                            style={{ ...saveBtn, ...(saving ? disabledStyle : {}) }}
                            onClick={handleSave}
                            disabled={saving}
                            type="button"
                        >
                            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                        </button>
                    </div>
                )}
            </div>

            {/* Change Password Section */}
            <div className={styles.sectionCard} data-tour="account-password">
                <div className={styles.securityHeader} style={{ ...(showPasswordSection ? { marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #f5f5f5' } : {}) }}>
                    <h3 style={sectionTitle}>Đổi mật khẩu</h3>
                    <button
                        style={toggleBtn}
                        onClick={() => {
                            setShowPasswordSection(v => !v);
                            setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
                        }}
                        type="button"
                    >
                        {showPasswordSection ? 'Đóng' : 'Đổi mật khẩu'}
                    </button>
                </div>

                {showPasswordSection && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        <div style={fieldGroup}>
                            <label style={fieldLabel}>Mật khẩu hiện tại</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    style={{ ...fieldInput, paddingRight: 40 }}
                                    type={showOldPw ? 'text' : 'password'}
                                    value={passwordForm.oldPassword}
                                    onChange={e => setPasswordForm(f => ({ ...f, oldPassword: e.target.value }))}
                                    placeholder="Nhập mật khẩu hiện tại"
                                    autoComplete="current-password"
                                />
                                <button type="button" onClick={() => setShowOldPw(v => !v)} style={eyeBtn} aria-label="Toggle password">
                                    {showOldPw ? <EyeOffIcon /> : <EyeIcon />}
                                </button>
                            </div>
                        </div>
                        <div className={styles.fieldGrid}>
                            <div style={fieldGroup}>
                                <label style={fieldLabel}>Mật khẩu mới</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        style={{ ...fieldInput, paddingRight: 40 }}
                                        type={showNewPw ? 'text' : 'password'}
                                        value={passwordForm.newPassword}
                                        onChange={e => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
                                        placeholder="Ít nhất 8 ký tự"
                                        autoComplete="new-password"
                                    />
                                    <button type="button" onClick={() => setShowNewPw(v => !v)} style={eyeBtn} aria-label="Toggle password">
                                        {showNewPw ? <EyeOffIcon /> : <EyeIcon />}
                                    </button>
                                </div>
                                {passwordForm.newPassword && (
                                    <div style={{ marginTop: 4 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                            <span style={{ fontSize: 11, color: 'rgba(26,34,56,0.5)' }}>Độ mạnh</span>
                                            <span style={{ fontSize: 11, fontWeight: 600, color: pwStrength.color }}>{pwStrength.label}</span>
                                        </div>
                                        <div style={{ width: '100%', height: 5, background: '#f0f0f0', borderRadius: 999, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: pwStrength.width, background: pwStrength.color, borderRadius: 999, transition: 'all 0.3s ease' }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div style={fieldGroup}>
                                <label style={fieldLabel}>Xác nhận mật khẩu mới</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        style={{ ...fieldInput, paddingRight: 40 }}
                                        type={showConfirmPw ? 'text' : 'password'}
                                        value={passwordForm.confirmPassword}
                                        onChange={e => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))}
                                        placeholder="Nhập lại mật khẩu mới"
                                        autoComplete="new-password"
                                    />
                                    <button type="button" onClick={() => setShowConfirmPw(v => !v)} style={eyeBtn} aria-label="Toggle password">
                                        {showConfirmPw ? <EyeOffIcon /> : <EyeIcon />}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
                            <button
                                style={{ ...saveBtn, ...(isChangePasswordDisabled ? disabledStyle : {}) }}
                                onClick={handleChangePassword}
                                disabled={isChangePasswordDisabled}
                                type="button"
                            >
                                {changingPassword ? 'Đang xử lý...' : 'Xác nhận đổi mật khẩu'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </PageContainer>
    );
};

// ── Styles ──
const avatarImg: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
};

const avatarInitials: React.CSSProperties = {
    color: '#f2f0e4',
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: 1,
};

const profileMeta: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
};

const profileName: React.CSSProperties = {
    fontSize: 20,
    fontWeight: 700,
    color: '#1a2238',
    margin: 0,
};

const roleBadge: React.CSSProperties = {
    display: 'inline-block',
    fontSize: 11,
    fontWeight: 600,
    color: '#3d4a3e',
    background: '#e8f0e5',
    padding: '2px 8px',
    borderRadius: 4,
    letterSpacing: 0.5,
    width: 'fit-content',
};

const memberSince: React.CSSProperties = {
    fontSize: 12,
    color: '#9ca3af',
    margin: 0,
};

const editBtn: React.CSSProperties = {
    padding: '8px 20px',
    background: '#1a2238',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
};

const sectionHeader: React.CSSProperties = {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: '1px solid #f5f5f5',
};

const sectionTitle: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 700,
    color: '#1a2238',
    margin: 0,
};

const fieldGroup: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
};

const fieldLabel: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: '#737373',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
};

const fieldValue: React.CSSProperties = {
    fontSize: 15,
    color: '#1a2238',
    margin: 0,
    fontWeight: 500,
};

const fieldInput: React.CSSProperties = {
    fontSize: 14,
    color: '#1a2238',
    border: '1.5px solid #e5e5e5',
    borderRadius: 8,
    padding: '9px 12px',
    outline: 'none',
    background: '#fafafa',
    fontFamily: "'IBM Plex Sans', sans-serif",
    width: '100%',
    boxSizing: 'border-box' as const,
};

const actionRow: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 24,
    paddingTop: 20,
    borderTop: '1px solid #f5f5f5',
    gridColumn: '1 / -1',
};

const cancelBtn: React.CSSProperties = {
    padding: '9px 20px',
    border: '1px solid #e5e5e5',
    background: '#fff',
    borderRadius: 8,
    fontSize: 13,
    color: '#737373',
    fontWeight: 500,
    cursor: 'pointer',
};

const readOnlyHint: React.CSSProperties = {
    fontSize: 11,
    color: '#9ca3af',
    fontStyle: 'italic',
};

const saveBtn: React.CSSProperties = {
    padding: '9px 24px',
    background: '#1a2238',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
};

const disabledStyle: React.CSSProperties = {
    opacity: 0.6,
    cursor: 'not-allowed',
};

const disabledSelectStyle: React.CSSProperties = {
    ...disabledStyle,
    appearance: 'none',
};

const errorTextStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#dc2626',
    marginTop: 2,
};

const toggleBtn: React.CSSProperties = {
    padding: '7px 16px',
    border: '1px solid #e5e5e5',
    background: '#fff',
    borderRadius: 8,
    fontSize: 13,
    color: '#525252',
    fontWeight: 500,
    cursor: 'pointer',
};

const eyeBtn: React.CSSProperties = {
    position: 'absolute',
    right: 8,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
    alignItems: 'center',
    color: '#9ca3af',
};

const EyeIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const EyeOffIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
);

export default TutorAccount;
