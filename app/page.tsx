export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl items-center px-6 py-16">
      <section aria-labelledby="welcome-title" className="max-w-2xl">
        <p className="mb-3 text-sm font-medium text-primary">RestaurantOS</p>
        <h1 id="welcome-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Your restaurant operations workspace
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
          The application foundation is ready. Restaurant workflows will be added in their
          dependency order.
        </p>
      </section>
    </main>
  );
}
