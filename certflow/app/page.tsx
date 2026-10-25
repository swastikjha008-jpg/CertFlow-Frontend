import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Hero } from "@/components/landing/hero";
import { About, Features, HowItWorks, ProductPreview } from "@/components/landing/sections";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <ProductPreview />
        <About />
      </main>
      <Footer />
    </>
  );
}
