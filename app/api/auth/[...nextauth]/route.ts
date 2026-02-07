import NextAuth, { type NextAuthOptions } from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"

const hasGoogleCreds = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
)

const providers: NextAuthOptions["providers"] = [
  Credentials({
    name: "Dev Login",
    credentials: {
      name: { label: "Name", type: "text", placeholder: "Demo User" },
    },
    async authorize(credentials) {
      const name = credentials?.name?.trim() || "Demo User"
      return { id: "dev-user", name, email: "dev@example.com" }
    },
  }),
]

if (hasGoogleCreds) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  )
}

const handler = NextAuth({
  providers,
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: true,
})

export { handler as GET, handler as POST }
