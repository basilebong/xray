import { Link } from "@tanstack/react-router";

import { Button } from "../components/ui/button.tsx";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../components/ui/card.tsx";

export function NotFoundView() {
	return (
		<Card role="alert">
			<CardHeader>
				<CardTitle>Page not found.</CardTitle>
				<CardDescription>The URL doesn't match any view in xray.</CardDescription>
			</CardHeader>
			<CardContent className="flex justify-end">
				<Link to="/">
					<Button size="sm" variant="outline">
						Back to sessions
					</Button>
				</Link>
			</CardContent>
		</Card>
	);
}
