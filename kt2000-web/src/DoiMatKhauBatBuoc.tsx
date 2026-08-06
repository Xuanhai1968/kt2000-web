import { useState } from "react";
import { Modal, Form, Input, Button, Alert, message, Space } from "antd";
import { doiMatKhau } from "./api";
import { useAuth } from "./AuthContext";

// QT-01: tài khoản mới tạo (hoặc vừa bị admin đặt lại) mang cờ MustChangePassword.
// Mật khẩu ban đầu thường được đọc qua điện thoại hoặc Zalo nên phải coi như đã lộ —
// chưa đổi thì chưa cho làm gì.
//
// Modal này CỐ Ý không đóng được: không nút X, không đóng khi bấm ra ngoài, không Esc.
// Lối ra duy nhất ngoài việc đổi mật khẩu là Đăng xuất — phải có, vì người quên mất
// mật khẩu vừa được cấp mà không thoát ra được thì coi như treo máy.
export default function DoiMatKhauBatBuoc() {
  const { session, signOut, xongDoiMatKhau } = useAuth();
  const [form] = Form.useForm();
  const [dangLuu, setDangLuu] = useState(false);

  const luu = async (v: any) => {
    setDangLuu(true);
    try {
      const { data } = await doiMatKhau(v.matKhauCu, v.matKhauMoi);
      message.success(data.message ?? "Đã đổi mật khẩu");
      form.resetFields();
      xongDoiMatKhau();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? "Không đổi được mật khẩu");
    } finally {
      setDangLuu(false);
    }
  };

  return (
    <Modal
      open={!!session?.user.mustChangePassword}
      title="Bắt buộc đổi mật khẩu"
      closable={false}
      maskClosable={false}
      keyboard={false}
      footer={null}
      width={440}
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="Đây là lần đăng nhập đầu với mật khẩu do quản trị viên cấp"
        description="Mật khẩu này quản trị viên đang xem được. Đổi xong thì chỉ mình bạn biết."
      />
      <Form form={form} layout="vertical" onFinish={luu}>
        <Form.Item name="matKhauCu" label="Mật khẩu hiện tại"
                   rules={[{ required: true, message: "Nhập mật khẩu vừa được cấp" }]}>
          <Input.Password autoFocus />
        </Form.Item>

        <Form.Item name="matKhauMoi" label="Mật khẩu mới"
                   rules={[
                     { required: true, message: "Nhập mật khẩu mới" },
                     { min: 8, message: "Tối thiểu 8 ký tự" },
                     { pattern: /\d/, message: "Phải có ít nhất một chữ số" },
                     ({ getFieldValue }) => ({
                       validator: (_, giaTri) =>
                         !giaTri || giaTri !== getFieldValue("matKhauCu")
                           ? Promise.resolve()
                           : Promise.reject(new Error("Mật khẩu mới phải khác mật khẩu cũ")),
                     }),
                   ]}>
          <Input.Password />
        </Form.Item>

        <Form.Item name="xacNhan" label="Nhập lại mật khẩu mới"
                   dependencies={["matKhauMoi"]}
                   rules={[
                     { required: true, message: "Nhập lại mật khẩu mới" },
                     ({ getFieldValue }) => ({
                       validator: (_, giaTri) =>
                         !giaTri || giaTri === getFieldValue("matKhauMoi")
                           ? Promise.resolve()
                           : Promise.reject(new Error("Hai lần nhập không khớp")),
                     }),
                   ]}>
          <Input.Password />
        </Form.Item>

        <Space style={{ width: "100%", justifyContent: "space-between" }}>
          <Button onClick={signOut}>Đăng xuất</Button>
          <Button type="primary" htmlType="submit" loading={dangLuu}>
            Đổi mật khẩu
          </Button>
        </Space>
      </Form>
    </Modal>
  );
}
