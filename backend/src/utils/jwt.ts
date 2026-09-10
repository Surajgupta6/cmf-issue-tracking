import jwt from "jsonwebtoken";

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

if(!JWT_ACCESS_SECRET){
    throw new Error("JWT_ACESS_SECRET is not defined");
}

interface  AccessTokenPayload{
    userId: string;
    role: string;
    organizationId: string;

}

export const generateAccessToken = (
    payload:AccessTokenPayload
) => {
    return jwt.sign(payload,JWT_ACCESS_SECRET,{
        expiresIn: "15m",
    });
};