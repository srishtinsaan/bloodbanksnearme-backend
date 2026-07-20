import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, 
  },
});

// console.log("EMAIL_USER:", process.env.EMAIL_USER);
// console.log("EMAIL_PASS length:", process.env.EMAIL_PASS?.length);



export const sendEmail = async ({ to, subject, html }) => {
  await transporter.sendMail({
    from: `"BloodConnect" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
};